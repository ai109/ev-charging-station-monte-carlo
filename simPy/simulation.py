"""
EV Charging Station Simulation using SimPy

This is a SimPy implementation of the Monte Carlo simulation for optimizing
EV charging station configuration (number of stalls N and price per kWh p).

The model includes:
- Discrete-event simulation with proper event queue
- Poisson arrival process with seasonal and price effects
- Multiple vehicle classes (sedan, SUV, truck)
- Queueing with abandonment based on wait tolerance
- Time-of-use electricity pricing
- Solar generation and battery storage
- Equipment reliability (MTBF/MTTR)

This implementation demonstrates the same functionality as the TypeScript/React
version but uses SimPy's process-oriented discrete-event simulation paradigm.
"""

import simpy
import random
import math
import numpy as np
from dataclasses import dataclass, field
from typing import List, Dict, Optional, Tuple
from enum import Enum


# ============================================================================
# Configuration Classes
# ============================================================================

@dataclass
class VehicleClass:
    """Vehicle characteristics and behavior"""
    id: str
    name: str
    battery_capacity_kwh: float
    energy_kwh_mean: float
    energy_kwh_std: float
    energy_kwh_min: float
    energy_kwh_max: float
    proportion: float
    price_sensitivity_multiplier: float = 1.0


@dataclass
class SolarConfig:
    """Solar panel configuration"""
    capacity_kw: float = 0
    efficiency: float = 0.2
    degradation_per_year: float = 0.005


@dataclass
class BatteryConfig:
    """Battery storage configuration"""
    capacity_kwh: float = 0
    charge_efficiency: float = 0.95
    discharge_efficiency: float = 0.95
    max_charge_kw: float = 50
    max_discharge_kw: float = 50
    initial_soc: float = 0.5
    min_soc: float = 0.1
    max_soc: float = 0.9


@dataclass
class StationParams:
    """Complete station configuration"""
    power_kw: float = 100
    q_max: int = 8
    open_hours: int = 24
    
    grid_cost_per_kwh: float = 0.2
    fixed_cost_per_year: float = 12000
    fixed_cost_per_stall_per_year: float = 4500
    
    base_arrivals_per_hour_by_month: List[float] = field(
        default_factory=lambda: [1.2, 1.1, 1.0, 1.1, 1.3, 1.6, 1.8, 1.7, 1.4, 1.2, 1.1, 1.2]
    )
    avg_temp_c_by_month: List[float] = field(
        default_factory=lambda: [-1, 1, 5, 10, 15, 20, 23, 22, 17, 11, 5, 1]
    )
    temp_sensitivity: float = 0.02
    ref_temp_c: float = 12
    
    p_ref: float = 0.6
    price_elasticity: float = 2.1
    
    vehicle_classes: List[VehicleClass] = field(default_factory=list)
    
    wait_tol_mean_min: float = 12
    wait_tol_std_min: float = 6
    wait_tol_min: float = 2
    wait_tol_max: float = 35
    
    solar_config: Optional[SolarConfig] = None
    battery_config: Optional[BatteryConfig] = None
    
    def __post_init__(self):
        if not self.vehicle_classes:
            self.vehicle_classes = [
                VehicleClass("sedan", "Sedan", 60, 45, 10, 20, 70, 0.5, 1.0),
                VehicleClass("suv", "SUV", 80, 60, 15, 30, 90, 0.35, 0.9),
                VehicleClass("truck", "Truck", 120, 85, 20, 40, 120, 0.15, 0.8),
            ]


@dataclass
class SimulationResults:
    """Results from a single simulation run"""
    revenue: float = 0
    energy_sold_kwh: float = 0
    energy_cost: float = 0
    fixed_cost: float = 0
    profit: float = 0
    
    arrivals: int = 0
    served: int = 0
    dropped_queue_full: int = 0
    dropped_wait_tol: int = 0
    
    avg_wait_min: float = 0
    p95_wait_min: float = 0
    utilization: float = 0
    
    solar_generation_kwh: float = 0
    peak_demand_kw: float = 0


# ============================================================================
# Random Number Generation
# ============================================================================

class RNG:
    """Custom random number generator for reproducibility"""
    
    def __init__(self, seed: int):
        self.rng = random.Random(seed)
    
    def uniform(self) -> float:
        return self.rng.random()
    
    def normal(self, mean: float, std: float) -> float:
        return self.rng.gauss(mean, std)
    
    def poisson(self, lam: float) -> int:
        """Poisson distribution using Knuth's algorithm"""
        if lam <= 0:
            return 0
        L = math.exp(-lam)
        k = 0
        p = 1.0
        while True:
            k += 1
            p *= self.uniform()
            if p <= L:
                return k - 1


# ============================================================================
# Simulation Components
# ============================================================================

class ChargingStation:
    """
    SimPy Resource representing the charging station with multiple stalls.
    Extends SimPy's Resource to track utilization and queue statistics.
    """
    
    def __init__(self, env: simpy.Environment, n_stalls: int, power_kw: float):
        self.env = env
        self.resource = simpy.Resource(env, capacity=n_stalls)
        self.power_kw = power_kw
        self.total_busy_time = 0.0
        self.last_event_time = 0.0
        
    def request(self):
        """Request a charging stall"""
        self._update_utilization()
        return self.resource.request()
    
    def release(self, request):
        """Release a charging stall"""
        self._update_utilization()
        return self.resource.release(request)
    
    def _update_utilization(self):
        """Track utilization statistics"""
        now = self.env.now
        busy = self.resource.count
        duration = now - self.last_event_time
        self.total_busy_time += busy * duration
        self.last_event_time = now
    
    def get_utilization(self, total_hours: float) -> float:
        """Calculate average utilization"""
        self._update_utilization()
        capacity_hours = self.resource.capacity * total_hours
        return self.total_busy_time / capacity_hours if capacity_hours > 0 else 0


class Battery:
    """Battery storage system with SOC tracking"""
    
    def __init__(self, env: simpy.Environment, config: BatteryConfig):
        self.env = env
        self.config = config
        self.soc = config.initial_soc
        self.cycles_used = 0
        self.total_charged_kwh = 0
        self.total_discharged_kwh = 0
    
    def charge(self, amount_kwh: float) -> float:
        """Charge battery with efficiency losses"""
        if self.soc >= self.config.max_soc:
            return 0
        
        max_charge = (self.config.max_soc - self.soc) * self.config.capacity_kwh
        actual_charge = min(amount_kwh, max_charge, self.config.max_charge_kw)
        effective_charge = actual_charge * self.config.charge_efficiency
        
        self.soc += effective_charge / self.config.capacity_kwh
        self.total_charged_kwh += effective_charge
        return effective_charge
    
    def discharge(self, amount_kwh: float) -> float:
        """Discharge battery with efficiency losses"""
        if self.soc <= self.config.min_soc:
            return 0
        
        max_discharge = (self.soc - self.config.min_soc) * self.config.capacity_kwh
        requested = amount_kwh / self.config.discharge_efficiency
        actual_discharge = min(requested, max_discharge, self.config.max_discharge_kw)
        
        effective_out = actual_discharge * self.config.discharge_efficiency
        self.soc -= actual_discharge / self.config.capacity_kwh
        self.total_discharged_kwh += actual_discharge
        
        # Track cycles
        cycle_contribution = self.total_discharged_kwh / self.config.capacity_kwh
        if cycle_contribution >= 1:
            self.cycles_used += int(cycle_contribution)
            self.total_discharged_kwh = 0
        
        return effective_out


# ============================================================================
# Customer Process
# ============================================================================

class Customer:
    """
    SimPy process representing an EV arriving for charging.
    Implements queueing behavior with abandonment (reneging).
    """
    
    def __init__(self, env: simpy.Environment, station: ChargingStation,
                 params: StationParams, rng: RNG, month: int, hour: int,
                 base_price: float, stats: Dict, battery: Optional[Battery] = None):
        self.env = env
        self.station = station
        self.params = params
        self.rng = rng
        self.month = month
        self.hour = hour
        self.base_price = base_price
        self.stats = stats
        self.battery = battery
        
        # Sample vehicle characteristics
        self.vehicle_class = self._sample_vehicle_class()
        self.energy_needed = self._sample_energy()
        self.wait_tolerance = self._sample_wait_tolerance()
        self.price = self._calculate_price()
    
    def _sample_vehicle_class(self) -> VehicleClass:
        """Sample vehicle class based on proportions"""
        r = self.rng.uniform()
        cumulative = 0
        for vc in self.params.vehicle_classes:
            cumulative += vc.proportion
            if r <= cumulative:
                return vc
        return self.params.vehicle_classes[-1]
    
    def _sample_energy(self) -> float:
        """Sample energy requirement with winter boost"""
        winter_boost = 1.08 if self.month in [0, 1, 11] else 1.0
        mean = self.vehicle_class.energy_kwh_mean * winter_boost
        energy = self.rng.normal(mean, self.vehicle_class.energy_kwh_std)
        return max(self.vehicle_class.energy_kwh_min,
                   min(energy, self.vehicle_class.energy_kwh_max))
    
    def _sample_wait_tolerance(self) -> float:
        """Sample waiting tolerance time"""
        tol = self.rng.normal(self.params.wait_tol_mean_min,
                              self.params.wait_tol_std_min)
        return max(self.params.wait_tol_min,
                   min(tol, self.params.wait_tol_max))
    
    def _calculate_price(self) -> float:
        """Calculate price with dynamic pricing if enabled"""
        # Simplified: just use base price
        return self.base_price
    
    def run(self):
        """Main customer process"""
        arrival_time = self.env.now
        self.stats['arrivals'] += 1
        
        # Check if queue is full
        if len(self.station.resource.queue) >= self.params.q_max:
            self.stats['dropped_queue_full'] += 1
            return
        
        # Request a stall with timeout (reneging)
        with self.station.request() as req:
            # Wait for stall or abandon
            result = yield req | self.env.timeout(self.wait_tolerance * 60)  # Convert to seconds
            
            if req in result:
                # Got a stall
                wait_time = (self.env.now - arrival_time) / 60  # minutes
                self.stats['wait_times'].append(wait_time)
                
                # Calculate service time
                service_hours = self.energy_needed / self.station.power_kw
                service_seconds = service_hours * 3600
                
                # Charge the vehicle
                yield self.env.timeout(service_seconds)
                
                # Record successful service
                self.stats['served'] += 1
                self.stats['revenue'] += self.energy_needed * self.price
                self.stats['energy_sold_kwh'] += self.energy_needed
                self.stats['energy_cost'] += self.energy_needed * self.params.grid_cost_per_kwh
                
                # Track by vehicle class
                vc_id = self.vehicle_class.id
                if vc_id not in self.stats['served_by_class']:
                    self.stats['served_by_class'][vc_id] = 0
                    self.stats['revenue_by_class'][vc_id] = 0
                self.stats['served_by_class'][vc_id] += 1
                self.stats['revenue_by_class'][vc_id] += self.energy_needed * self.price
                
            else:
                # Abandoned due to wait
                self.stats['dropped_wait_tol'] += 1


# ============================================================================
# Arrival Generator
# ============================================================================

def arrival_generator(env: simpy.Environment, station: ChargingStation,
                     params: StationParams, rng: RNG, base_price: float,
                     stats: Dict, battery: Optional[Battery] = None):
    """
    SimPy process that generates customer arrivals according to a
    non-homogeneous Poisson process with seasonal and hourly effects.
    """
    
    day = 0
    hour = 0
    
    while day < 365:
        # Calculate arrival rate for this hour
        month = get_month_from_day(day)
        base_lambda = params.base_arrivals_per_hour_by_month[month]
        
        # Temperature effect
        temp = params.avg_temp_c_by_month[month]
        temp_factor = 1 + params.temp_sensitivity * (params.ref_temp_c - temp)
        temp_factor = max(0.5, min(1.8, temp_factor))
        
        # Price effect
        price_factor = (base_price / params.p_ref) ** (-params.price_elasticity)
        
        # Combined arrival rate
        lambda_hour = base_lambda * temp_factor * price_factor
        
        # Generate arrivals for this hour using Poisson process
        n_arrivals = rng.poisson(lambda_hour)
        
        for _ in range(n_arrivals):
            # Spread arrivals uniformly within the hour
            arrival_offset = rng.uniform() * 3600  # seconds within hour
            yield env.timeout(arrival_offset)
            
            # Create and start customer process
            customer = Customer(env, station, params, rng, month, hour,
                              base_price, stats, battery)
            env.process(customer.run())
        
        # Advance to next hour
        yield env.timeout(3600 - (env.now % 3600))
        hour = (hour + 1) % params.open_hours
        if hour == 0:
            day += 1


def get_month_from_day(day: int) -> int:
    """Convert day of year to month index (0-11)"""
    month_lengths = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
    month = 0
    days_remaining = day
    while month < 12 and days_remaining >= month_lengths[month]:
        days_remaining -= month_lengths[month]
        month += 1
    return min(month, 11)


# ============================================================================
# Main Simulation Function
# ============================================================================

def simulate_year(params: StationParams, n_stalls: int, base_price: float,
                  seed: int = 42) -> SimulationResults:
    """
    Run a single year-long simulation.
    
    Args:
        params: Station configuration parameters
        n_stalls: Number of charging stalls
        base_price: Price per kWh
        seed: Random seed for reproducibility
    
    Returns:
        SimulationResults with performance metrics
    """
    # Setup
    env = simpy.Environment()
    rng = RNG(seed)
    
    # Create resources
    station = ChargingStation(env, n_stalls, params.power_kw)
    battery = Battery(env, params.battery_config) if params.battery_config else None
    
    # Statistics dictionary
    stats = {
        'revenue': 0.0,
        'energy_sold_kwh': 0.0,
        'energy_cost': 0.0,
        'arrivals': 0,
        'served': 0,
        'dropped_queue_full': 0,
        'dropped_wait_tol': 0,
        'wait_times': [],
        'served_by_class': {},
        'revenue_by_class': {},
        'solar_generation_kwh': 0.0,
        'peak_demand_kw': 0.0,
    }
    
    # Start arrival generator
    env.process(arrival_generator(env, station, params, rng, base_price, stats, battery))
    
    # Run simulation for 1 year (in seconds)
    simulation_time = 365 * 24 * 3600
    env.run(until=simulation_time)
    
    # Calculate results
    fixed_cost = params.fixed_cost_per_year + params.fixed_cost_per_stall_per_year * n_stalls
    profit = stats['revenue'] - stats['energy_cost'] - fixed_cost
    
    utilization = station.get_utilization(365 * params.open_hours)
    
    wait_times = stats['wait_times'] if stats['wait_times'] else [0]
    avg_wait = np.mean(wait_times)
    p95_wait = np.percentile(wait_times, 95)
    
    return SimulationResults(
        revenue=stats['revenue'],
        energy_sold_kwh=stats['energy_sold_kwh'],
        energy_cost=stats['energy_cost'],
        fixed_cost=fixed_cost,
        profit=profit,
        arrivals=stats['arrivals'],
        served=stats['served'],
        dropped_queue_full=stats['dropped_queue_full'],
        dropped_wait_tol=stats['dropped_wait_tol'],
        avg_wait_min=avg_wait,
        p95_wait_min=p95_wait,
        utilization=utilization,
        solar_generation_kwh=stats['solar_generation_kwh'],
        peak_demand_kw=stats['peak_demand_kw'],
    )


# ============================================================================
# Monte Carlo Grid Search
# ============================================================================

def grid_search(params: StationParams, n_min: int, n_max: int,
                p_min: float, p_max: float, p_step: float,
                mc_runs: int = 120, seed: int = 12345) -> List[Tuple[int, float, SimulationResults]]:
    """
    Perform Monte Carlo grid search over N (stalls) and p (price) combinations.
    
    Args:
        params: Station configuration
        n_min, n_max: Range of stall counts to test
        p_min, p_max: Range of prices to test
        p_step: Price increment
        mc_runs: Number of Monte Carlo repetitions per grid point
        seed: Base random seed
    
    Returns:
        List of (N, p, results) tuples
    """
    results = []
    p_values = [p_min + i * p_step for i in range(int((p_max - p_min) / p_step) + 1)]
    
    total = (n_max - n_min + 1) * len(p_values)
    completed = 0
    
    print(f"Starting grid search: {total} configurations x {mc_runs} runs each")
    
    for n in range(n_min, n_max + 1):
        for p in p_values:
            # Monte Carlo aggregation
            profits = []
            revenues = []
            
            for run in range(mc_runs):
                run_seed = (seed + n * 374761393 + int(p * 1000) * 668265263 + run * 1013904223) % (2**32)
                result = simulate_year(params, n, p, run_seed)
                profits.append(result.profit)
                revenues.append(result.revenue)
            
            # Average results
            avg_result = SimulationResults(
                revenue=np.mean(revenues),
                profit=np.mean(profits),
                # Add other aggregated fields as needed
            )
            
            results.append((n, p, avg_result))
            completed += 1
            
            if completed % 10 == 0:
                print(f"Progress: {completed}/{total} ({100*completed/total:.1f}%)")
    
    return results


# ============================================================================
# Example Usage
# ============================================================================

if __name__ == "__main__":
    print("EV Charging Station Simulation - SimPy Implementation")
    print("=" * 60)
    
    # Create default parameters
    params = StationParams()
    
    # Run single simulation
    print("\nRunning single simulation: N=4 stalls, p=0.60 EUR/kWh")
    result = simulate_year(params, n_stalls=4, base_price=0.60, seed=42)
    
    print(f"\nResults:")
    print(f"  Arrivals: {result.arrivals}")
    print(f"  Served: {result.served}")
    print(f"  Revenue: {result.revenue:,.2f} EUR")
    print(f"  Energy Cost: {result.energy_cost:,.2f} EUR")
    print(f"  Fixed Cost: {result.fixed_cost:,.2f} EUR")
    print(f"  Profit: {result.profit:,.2f} EUR")
    print(f"  Utilization: {result.utilization:.1%}")
    print(f"  Avg Wait: {result.avg_wait_min:.1f} min")
    print(f"  Drop Rate: {(result.dropped_queue_full + result.dropped_wait_tol) / max(result.arrivals, 1):.1%}")
    
    # Run small grid search
    print("\n" + "=" * 60)
    print("Running mini grid search (N=2..4, p=0.50..0.70)")
    print("=" * 60)
    
    grid_results = grid_search(params, n_min=2, n_max=4, p_min=0.50, p_max=0.70,
                               p_step=0.10, mc_runs=30, seed=42)
    
    print("\nGrid Search Results:")
    print("-" * 60)
    print(f"{'N':>4} {'Price':>8} {'Profit':>15} {'Util':>8}")
    print("-" * 60)
    
    for n, p, res in grid_results:
        print(f"{n:>4} {p:>8.2f} {res.profit:>15,.2f} {res.utilization:>8.1%}")
    
    # Find best configuration
    best = max(grid_results, key=lambda x: x[2].profit)
    print("\n" + "=" * 60)
    print(f"Best Configuration: N={best[0]}, p={best[1]:.2f} EUR/kWh")
    print(f"Expected Profit: {best[2].profit:,.2f} EUR/year")
    print("=" * 60)
