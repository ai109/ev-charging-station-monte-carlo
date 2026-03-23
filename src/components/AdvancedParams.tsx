import { useState } from "react";
import type { StationParams, VehicleClass, TOUPeriod, SolarConfig, BatteryConfig, DemandChargeConfig, DynamicPricingConfig } from "../sim/types";

const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
] as const;

const MIN_POSITIVE = 0.001;

// Default vehicle classes
const DEFAULT_VEHICLE_CLASSES: VehicleClass[] = [
  {
    id: "sedan",
    name: "Sedan",
    batteryCapacityKwh: 60,
    energyKwhMean: 45,
    energyKwhStd: 10,
    energyKwhMin: 20,
    energyKwhMax: 70,
    proportion: 0.5,
    priceSensitivityMultiplier: 1.0,
  },
  {
    id: "suv",
    name: "SUV",
    batteryCapacityKwh: 80,
    energyKwhMean: 60,
    energyKwhStd: 15,
    energyKwhMin: 30,
    energyKwhMax: 90,
    proportion: 0.35,
    priceSensitivityMultiplier: 0.9,
  },
  {
    id: "truck",
    name: "Truck",
    batteryCapacityKwh: 120,
    energyKwhMean: 85,
    energyKwhStd: 20,
    energyKwhMin: 40,
    energyKwhMax: 120,
    proportion: 0.15,
    priceSensitivityMultiplier: 0.8,
  },
];

export function AdvancedParams({
  value,
  onChange,
  onReset,
}: {
  value: StationParams;
  onChange: (v: StationParams) => void;
  onReset: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<"basic" | "vehicles" | "energy" | "pricing" | "advanced">("basic");

  const patch = (partial: Partial<StationParams>) => {
    onChange({ ...value, ...partial });
  };

  const baseArrivals = normalizeMonthArray(value.baseArrivalsPerHourByMonth, 1);
  const avgTemps = normalizeMonthArray(value.avgTempCByMonth, 10);

  const setBaseArrival = (month: number, raw: number) => {
    const next = [...baseArrivals];
    next[month] = clampNum(raw, MIN_POSITIVE, 200);
    patch({ baseArrivalsPerHourByMonth: next });
  };

  const setAvgTemp = (month: number, raw: number) => {
    const next = [...avgTemps];
    next[month] = clampNum(raw, -40, 60);
    patch({ avgTempCByMonth: next });
  };

  const updateVehicleClass = (index: number, partial: Partial<VehicleClass>) => {
    const classes = [...(value.vehicleClasses || DEFAULT_VEHICLE_CLASSES)];
    classes[index] = { ...classes[index], ...partial };
    onChange({ ...value, vehicleClasses: classes });
  };

  const addVehicleClass = () => {
    const classes = [...(value.vehicleClasses || [])];
    classes.push({
      id: `class_${classes.length + 1}`,
      name: `Vehicle Class ${classes.length + 1}`,
      batteryCapacityKwh: 60,
      energyKwhMean: 45,
      energyKwhStd: 10,
      energyKwhMin: 20,
      energyKwhMax: 70,
      proportion: 0,
      priceSensitivityMultiplier: 1.0,
    });
    onChange({ ...value, vehicleClasses: classes });
  };

  const removeVehicleClass = (index: number) => {
    const classes = [...(value.vehicleClasses || [])];
    classes.splice(index, 1);
    // Renormalize proportions
    const total = classes.reduce((sum, c) => sum + c.proportion, 0);
    if (total > 0) {
      classes.forEach(c => c.proportion /= total);
    }
    onChange({ ...value, vehicleClasses: classes });
  };

  const updateTOUSchedule = (index: number, partial: Partial<TOUPeriod>) => {
    const schedule = [...(value.touSchedule || [])];
    schedule[index] = { ...schedule[index], ...partial };
    patch({ touSchedule: schedule });
  };

  const addTOUPeriod = () => {
    const schedule = [...(value.touSchedule || [])];
    const lastHour = schedule.length > 0 ? schedule[schedule.length - 1].hourEnd : 0;
    if (lastHour < 24) {
      schedule.push({
        hourStart: lastHour,
        hourEnd: Math.min(lastHour + 8, 24),
        costPerKwh: value.gridCostPerKwh || 0.15,
      });
      patch({ touSchedule: schedule });
    }
  };

  const removeTOUPeriod = (index: number) => {
    const schedule = [...(value.touSchedule || [])];
    schedule.splice(index, 1);
    patch({ touSchedule: schedule });
  };

  return (
    <div className="rounded-xl border bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-lg font-semibold">Advanced Parameters</div>
          <div className="text-sm opacity-70">
            Configure vehicle types, pricing models, and energy systems.
          </div>
        </div>

        <div className="flex gap-2">
          <button className="px-3 py-2 rounded border" onClick={onReset}>
            Reset to defaults
          </button>
          <button
            className="px-3 py-2 rounded border bg-black text-white"
            onClick={() => setOpen((v) => !v)}
          >
            {open ? "Hide advanced" : "Show advanced"}
          </button>
        </div>
      </div>

      {open && (
        <div className="mt-4 space-y-4">
          {/* Tab Navigation */}
          <div className="flex gap-2 border-b">
            {(["basic", "vehicles", "energy", "pricing", "advanced"] as const).map((tab) => (
              <button
                key={tab}
                className={`px-4 py-2 text-sm font-medium ${
                  activeTab === tab
                    ? "border-b-2 border-black text-black"
                    : "text-gray-500 hover:text-black"
                }`}
                onClick={() => setActiveTab(tab)}
              >
                {tab.charAt(0).toUpperCase() + tab.slice(1)}
              </button>
            ))}
          </div>

          {/* Basic Tab */}
          {activeTab === "basic" && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                <ParamInput
                  label="Reference price pRef (€/kWh)"
                  helper="Baseline price used by the elasticity demand model."
                  value={value.pRef}
                  step="0.01"
                  onChange={(x) => patch({ pRef: clampNum(x, MIN_POSITIVE, 20) })}
                />

                <ParamInput
                  label="Price elasticity ε"
                  helper="How strongly arrivals change when price changes."
                  value={value.priceElasticity}
                  step="0.01"
                  onChange={(x) =>
                    patch({ priceElasticity: clampNum(x, MIN_POSITIVE, 20) })
                  }
                />

                <ParamInput
                  label="Base grid energy cost (€/kWh)"
                  helper="Default electricity cost (used when TOU not configured)."
                  value={value.gridCostPerKwh}
                  step="0.01"
                  onChange={(x) =>
                    patch({ gridCostPerKwh: clampNum(x, 0, 20) })
                  }
                />

                <ParamInput
                  label="Power per stall (kW)"
                  helper="Charging power per stall affects service duration."
                  value={value.powerKw}
                  step="1"
                  onChange={(x) => patch({ powerKw: clampNum(x, MIN_POSITIVE, 1000) })}
                />

                <ParamInput
                  label="Queue capacity qMax (cars)"
                  helper="Maximum vehicles that can wait before drops occur."
                  value={value.qMax}
                  step="1"
                  onChange={(x) => patch({ qMax: clampInt(x, 0, 2000) })}
                />

                <ParamInput
                  label="Open hours per day"
                  helper="Operating hours simulated each day."
                  value={value.openHours}
                  step="1"
                  onChange={(x) => patch({ openHours: clampInt(x, 1, 24) })}
                />

                <ParamInput
                  label="Fixed cost per year (€/year)"
                  helper="Annual overhead independent of stall count."
                  value={value.fixedCostPerYear}
                  step="100"
                  onChange={(x) =>
                    patch({ fixedCostPerYear: clampNum(x, 0, 10_000_000) })
                  }
                />

                <ParamInput
                  label="Fixed cost per stall (€/stall/year)"
                  helper="Annualized cost per installed stall."
                  value={value.fixedCostPerStallPerYear}
                  step="100"
                  onChange={(x) =>
                    patch({
                      fixedCostPerStallPerYear: clampNum(x, 0, 10_000_000),
                    })
                  }
                />
              </div>

              <MonthGroup
                title="Monthly Base Arrivals (arrivals/hour)"
                helper="Baseline arrival rate before price/temperature effects."
                values={baseArrivals}
                onChange={setBaseArrival}
                step="0.01"
              />

              <MonthGroup
                title="Monthly Average Temperature (°C)"
                helper="Average temperature used in demand factor."
                values={avgTemps}
                onChange={setAvgTemp}
                step="0.1"
              />
            </div>
          )}

          {/* Vehicles Tab */}
          {activeTab === "vehicles" && (
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <h3 className="font-semibold">Vehicle Classes</h3>
                <button
                  className="px-3 py-1 rounded bg-black text-white text-sm"
                  onClick={addVehicleClass}
                >
                  Add Class
                </button>
              </div>

              {(value.vehicleClasses || DEFAULT_VEHICLE_CLASSES).map((vc, idx) => (
                <div key={vc.id} className="rounded-lg border p-4 space-y-3">
                  <div className="flex justify-between items-center">
                    <input
                      className="font-semibold border-b border-transparent hover:border-gray-300 focus:border-black outline-none"
                      value={vc.name}
                      onChange={(e) => updateVehicleClass(idx, { name: e.target.value })}
                    />
                    <button
                      className="text-red-600 text-sm"
                      onClick={() => removeVehicleClass(idx)}
                    >
                      Remove
                    </button>
                  </div>

                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <ParamInput
                      label="Proportion"
                      helper="Share of arrivals"
                      value={vc.proportion}
                      step="0.01"
                      onChange={(x) => updateVehicleClass(idx, { proportion: clampNum(x, 0, 1) })}
                    />
                    <ParamInput
                      label="Price Sensitivity"
                      helper="1.0 = avg, >1.0 = more sensitive"
                      value={vc.priceSensitivityMultiplier}
                      step="0.1"
                      onChange={(x) => updateVehicleClass(idx, { priceSensitivityMultiplier: clampNum(x, 0.1, 3) })}
                    />
                    <ParamInput
                      label="Battery (kWh)"
                      helper="Typical battery size"
                      value={vc.batteryCapacityKwh}
                      step="5"
                      onChange={(x) => updateVehicleClass(idx, { batteryCapacityKwh: clampNum(x, 10, 500) })}
                    />
                    <ParamInput
                      label="Energy Mean (kWh)"
                      helper="Average energy per session"
                      value={vc.energyKwhMean}
                      step="1"
                      onChange={(x) => updateVehicleClass(idx, { 
                        energyKwhMean: clampNum(x, vc.energyKwhMin, vc.energyKwhMax) 
                      })}
                    />
                    <ParamInput
                      label="Energy Std (kWh)"
                      helper="Variability"
                      value={vc.energyKwhStd}
                      step="1"
                      onChange={(x) => updateVehicleClass(idx, { energyKwhStd: clampNum(x, 0, 100) })}
                    />
                    <ParamInput
                      label="Energy Min (kWh)"
                      helper="Lower bound"
                      value={vc.energyKwhMin}
                      step="1"
                      onChange={(x) => updateVehicleClass(idx, { 
                        energyKwhMin: clampNum(x, 0, vc.energyKwhMean) 
                      })}
                    />
                    <ParamInput
                      label="Energy Max (kWh)"
                      helper="Upper bound"
                      value={vc.energyKwhMax}
                      step="1"
                      onChange={(x) => updateVehicleClass(idx, { 
                        energyKwhMax: clampNum(x, vc.energyKwhMean, 500) 
                      })}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Energy Tab */}
          {activeTab === "energy" && (
            <div className="space-y-4">
              {/* Solar Configuration */}
              <div className="rounded-lg border p-4">
                <h3 className="font-semibold mb-3">Solar Panels</h3>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                  <ParamInput
                    label="Capacity (kW)"
                    helper="Peak solar capacity"
                    value={value.solarConfig?.capacityKw || 0}
                    step="1"
                    onChange={(x) => patch({ 
                      solarConfig: { 
                        ...(value.solarConfig || {} as SolarConfig),
                        capacityKw: clampNum(x, 0, 1000)
                      } as SolarConfig
                    })}
                  />
                  <ParamInput
                    label="Efficiency"
                    helper="Panel efficiency (0-1)"
                    value={value.solarConfig?.efficiency || 0.2}
                    step="0.01"
                    onChange={(x) => patch({ 
                      solarConfig: { 
                        ...(value.solarConfig || {} as SolarConfig),
                        efficiency: clampNum(x, 0.1, 0.5)
                      } as SolarConfig
                    })}
                  />
                  <ParamInput
                    label="Degradation/Year"
                    helper="Annual degradation (e.g., 0.005)"
                    value={value.solarConfig?.degradationPerYear || 0.005}
                    step="0.001"
                    onChange={(x) => patch({ 
                      solarConfig: { 
                        ...(value.solarConfig || {} as SolarConfig),
                        degradationPerYear: clampNum(x, 0, 0.02)
                      } as SolarConfig
                    })}
                  />
                </div>
              </div>

              {/* Battery Configuration */}
              <div className="rounded-lg border p-4">
                <h3 className="font-semibold mb-3">Battery Storage</h3>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                  <ParamInput
                    label="Capacity (kWh)"
                    helper="Total battery capacity"
                    value={value.batteryConfig?.capacityKwh || 0}
                    step="10"
                    onChange={(x) => patch({ 
                      batteryConfig: { 
                        ...(value.batteryConfig || {} as BatteryConfig),
                        capacityKwh: clampNum(x, 0, 10000)
                      } as BatteryConfig
                    })}
                  />
                  <ParamInput
                    label="Max Charge (kW)"
                    helper="Max charging rate"
                    value={value.batteryConfig?.maxChargeKw || 50}
                    step="5"
                    onChange={(x) => patch({ 
                      batteryConfig: { 
                        ...(value.batteryConfig || {} as BatteryConfig),
                        maxChargeKw: clampNum(x, 0, 1000)
                      } as BatteryConfig
                    })}
                  />
                  <ParamInput
                    label="Max Discharge (kW)"
                    helper="Max discharging rate"
                    value={value.batteryConfig?.maxDischargeKw || 50}
                    step="5"
                    onChange={(x) => patch({ 
                      batteryConfig: { 
                        ...(value.batteryConfig || {} as BatteryConfig),
                        maxDischargeKw: clampNum(x, 0, 1000)
                      } as BatteryConfig
                    })}
                  />
                  <ParamInput
                    label="Charge Efficiency"
                    helper="Charging efficiency (0-1)"
                    value={value.batteryConfig?.chargeEfficiency || 0.95}
                    step="0.01"
                    onChange={(x) => patch({ 
                      batteryConfig: { 
                        ...(value.batteryConfig || {} as BatteryConfig),
                        chargeEfficiency: clampNum(x, 0.5, 1)
                      } as BatteryConfig
                    })}
                  />
                  <ParamInput
                    label="Discharge Efficiency"
                    helper="Discharging efficiency (0-1)"
                    value={value.batteryConfig?.dischargeEfficiency || 0.95}
                    step="0.01"
                    onChange={(x) => patch({ 
                      batteryConfig: { 
                        ...(value.batteryConfig || {} as BatteryConfig),
                        dischargeEfficiency: clampNum(x, 0.5, 1)
                      } as BatteryConfig
                    })}
                  />
                  <ParamInput
                    label="Initial SOC"
                    helper="Initial state of charge (0-1)"
                    value={value.batteryConfig?.initialSoc || 0.5}
                    step="0.05"
                    onChange={(x) => patch({ 
                      batteryConfig: { 
                        ...(value.batteryConfig || {} as BatteryConfig),
                        initialSoc: clampNum(x, 0, 1)
                      } as BatteryConfig
                    })}
                  />
                  <ParamInput
                    label="Min SOC"
                    helper="Minimum state of charge (0-1)"
                    value={value.batteryConfig?.minSoc || 0.1}
                    step="0.05"
                    onChange={(x) => patch({ 
                      batteryConfig: { 
                        ...(value.batteryConfig || {} as BatteryConfig),
                        minSoc: clampNum(x, 0, 0.5)
                      } as BatteryConfig
                    })}
                  />
                  <ParamInput
                    label="Max SOC"
                    helper="Maximum state of charge (0-1)"
                    value={value.batteryConfig?.maxSoc || 0.9}
                    step="0.05"
                    onChange={(x) => patch({ 
                      batteryConfig: { 
                        ...(value.batteryConfig || {} as BatteryConfig),
                        maxSoc: clampNum(x, 0.5, 1)
                      } as BatteryConfig
                    })}
                  />
                  <ParamInput
                    label="Replacement Cost (€)"
                    helper="Cost after warranty expires"
                    value={value.batteryConfig?.replacementCost || 50000}
                    step="1000"
                    onChange={(x) => patch({ 
                      batteryConfig: { 
                        ...(value.batteryConfig || {} as BatteryConfig),
                        replacementCost: clampNum(x, 0, 1000000)
                      } as BatteryConfig
                    })}
                  />
                </div>
              </div>
            </div>
          )}

          {/* Pricing Tab */}
          {activeTab === "pricing" && (
            <div className="space-y-4">
              {/* TOU Schedule */}
              <div className="rounded-lg border p-4">
                <div className="flex justify-between items-center mb-3">
                  <h3 className="font-semibold">Time-of-Use Pricing</h3>
                  <button
                    className="px-3 py-1 rounded bg-black text-white text-sm"
                    onClick={addTOUPeriod}
                  >
                    Add Period
                  </button>
                </div>

                {(value.touSchedule || []).map((period, idx) => (
                  <div key={idx} className="flex gap-3 items-center mb-2">
                    <input
                      type="number"
                      className="w-20 rounded border px-2 py-1"
                      value={period.hourStart}
                      onChange={(e) => updateTOUSchedule(idx, { hourStart: parseInt(e.target.value) })}
                      min={0}
                      max={23}
                    />
                    <span>to</span>
                    <input
                      type="number"
                      className="w-20 rounded border px-2 py-1"
                      value={period.hourEnd}
                      onChange={(e) => updateTOUSchedule(idx, { hourEnd: parseInt(e.target.value) })}
                      min={1}
                      max={24}
                    />
                    <span>hours @</span>
                    <input
                      type="number"
                      className="w-24 rounded border px-2 py-1"
                      value={period.costPerKwh}
                      step="0.01"
                      onChange={(e) => updateTOUSchedule(idx, { costPerKwh: parseFloat(e.target.value) })}
                    />
                    <span>€/kWh</span>
                    <button
                      className="text-red-600 text-sm"
                      onClick={() => removeTOUPeriod(idx)}
                    >
                      Remove
                    </button>
                  </div>
                ))}
              </div>

              {/* Demand Charges */}
              <div className="rounded-lg border p-4">
                <h3 className="font-semibold mb-3">Peak Demand Charges</h3>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={value.demandCharge?.enabled || false}
                      onChange={(e) => patch({
                        demandCharge: {
                          ...(value.demandCharge || {} as DemandChargeConfig),
                          enabled: e.target.checked
                        } as DemandChargeConfig
                      })}
                    />
                    <span className="text-sm">Enable demand charges</span>
                  </label>
                  <ParamInput
                    label="Rate (€/kW)"
                    helper="Cost per kW of peak demand"
                    value={value.demandCharge?.ratePerKw || 10}
                    step="1"
                    disabled={!value.demandCharge?.enabled}
                    onChange={(x) => patch({ 
                      demandCharge: { 
                        ...(value.demandCharge || {} as DemandChargeConfig),
                        ratePerKw: clampNum(x, 0, 100)
                      } as DemandChargeConfig
                    })}
                  />
                  <ParamInput
                    label="Billing Demand %"
                    helper="Percentage of peak to bill"
                    value={value.demandCharge?.billingDemandPercent || 0.8}
                    step="0.05"
                    disabled={!value.demandCharge?.enabled}
                    onChange={(x) => patch({ 
                      demandCharge: { 
                        ...(value.demandCharge || {} as DemandChargeConfig),
                        billingDemandPercent: clampNum(x, 0, 1)
                      } as DemandChargeConfig
                    })}
                  />
                </div>
              </div>

              {/* Dynamic Pricing */}
              <div className="rounded-lg border p-4">
                <h3 className="font-semibold mb-3">Dynamic Pricing</h3>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={value.dynamicPricing?.enabled || false}
                      onChange={(e) => patch({
                        dynamicPricing: {
                          ...(value.dynamicPricing || {} as DynamicPricingConfig),
                          enabled: e.target.checked
                        } as DynamicPricingConfig
                      })}
                    />
                    <span className="text-sm">Enable dynamic pricing</span>
                  </label>
                  <ParamInput
                    label="Base Price (€/kWh)"
                    helper="Base price before adjustments"
                    value={value.dynamicPricing?.basePrice || 0.3}
                    step="0.01"
                    disabled={!value.dynamicPricing?.enabled}
                    onChange={(x) => patch({ 
                      dynamicPricing: { 
                        ...(value.dynamicPricing || {} as DynamicPricingConfig),
                        basePrice: clampNum(x, 0.05, 5)
                      } as DynamicPricingConfig
                    })}
                  />
                  <ParamInput
                    label="Surge Multiplier"
                    helper="Max price multiplier (e.g., 2.0)"
                    value={value.dynamicPricing?.surgeMultiplier || 1.5}
                    step="0.1"
                    disabled={!value.dynamicPricing?.enabled}
                    onChange={(x) => patch({ 
                      dynamicPricing: { 
                        ...(value.dynamicPricing || {} as DynamicPricingConfig),
                        surgeMultiplier: clampNum(x, 1, 5)
                      } as DynamicPricingConfig
                    })}
                  />
                  <ParamInput
                    label="Utilization Threshold"
                    helper="Trigger surge at this % (0-1)"
                    value={value.dynamicPricing?.thresholdUtilization || 0.8}
                    step="0.05"
                    disabled={!value.dynamicPricing?.enabled}
                    onChange={(x) => patch({ 
                      dynamicPricing: { 
                        ...(value.dynamicPricing || {} as DynamicPricingConfig),
                        thresholdUtilization: clampNum(x, 0, 1)
                      } as DynamicPricingConfig
                    })}
                  />
                </div>
              </div>
            </div>
          )}

          {/* Advanced Tab */}
          {activeTab === "advanced" && (
            <div className="space-y-4">
              {/* Waiting Tolerance */}
              <div className="rounded-lg border p-4">
                <h3 className="font-semibold mb-3">Waiting Tolerance</h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <ParamInput
                    label="Mean (minutes)"
                    helper="Average max waiting time"
                    value={value.waitTolMeanMin}
                    step="0.1"
                    onChange={(x) =>
                      patch({ waitTolMeanMin: clampNum(x, value.waitTolMin, value.waitTolMax) })
                    }
                  />
                  <ParamInput
                    label="Std Dev (minutes)"
                    helper="Variability"
                    value={value.waitTolStdMin}
                    step="0.1"
                    onChange={(x) =>
                      patch({ waitTolStdMin: clampNum(x, 0, 1440) })
                    }
                  />
                  <ParamInput
                    label="Min (minutes)"
                    helper="Lower bound"
                    value={value.waitTolMin}
                    step="0.1"
                    onChange={(x) =>
                      patch({ waitTolMin: clampNum(x, 0, value.waitTolMeanMin) })
                    }
                  />
                  <ParamInput
                    label="Max (minutes)"
                    helper="Upper bound"
                    value={value.waitTolMax}
                    step="0.1"
                    onChange={(x) =>
                      patch({ waitTolMax: clampNum(x, value.waitTolMeanMin, 1440) })
                    }
                  />
                </div>
              </div>

              {/* Temperature */}
              <div className="rounded-lg border p-4">
                <h3 className="font-semibold mb-3">Temperature Effects</h3>
                <div className="grid grid-cols-2 gap-3">
                  <ParamInput
                    label="Temperature Sensitivity"
                    helper="Demand shift per °C from reference"
                    value={value.tempSensitivity}
                    step="0.001"
                    onChange={(x) => patch({ tempSensitivity: clampNum(x, -2, 2) })}
                  />
                  <ParamInput
                    label="Reference Temperature (°C)"
                    helper="Temp where factor equals 1.0"
                    value={value.refTempC}
                    step="0.1"
                    onChange={(x) => patch({ refTempC: clampNum(x, -40, 60) })}
                  />
                </div>
              </div>

              {/* Demand Growth */}
              <div className="rounded-lg border p-4">
                <h3 className="font-semibold mb-3">Demand Growth</h3>
                <ParamInput
                  label="Annual Demand Growth"
                  helper="Yearly growth rate (e.g., 0.05 = 5%)"
                  value={value.annualDemandGrowth || 0}
                  step="0.01"
                  onChange={(x) => patch({ annualDemandGrowth: clampNum(x, -0.2, 0.5) })}
                />
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ParamInput({
  label,
  helper,
  value,
  step,
  disabled,
  onChange,
}: {
  label: string;
  helper: string;
  value: number;
  step: string;
  disabled?: boolean;
  onChange: (value: number) => void;
}) {
  return (
    <div className={`rounded-lg border p-3 ${disabled ? 'opacity-50' : ''}`}>
      <div className="text-xs opacity-70">{helper}</div>
      <label className="block mt-2">
        <div className="text-xs font-semibold mb-1">{label}</div>
        <input
          className="w-full rounded border px-3 py-2 text-sm disabled:bg-gray-100"
          type="number"
          step={step}
          value={Number.isFinite(value) ? value : 0}
          disabled={disabled}
          onChange={(e) => onChange(Number(e.target.value))}
        />
      </label>
    </div>
  );
}

function MonthGroup({
  title,
  helper,
  values,
  onChange,
  step,
}: {
  title: string;
  helper: string;
  values: number[];
  onChange: (month: number, value: number) => void;
  step: string;
}) {
  return (
    <div className="rounded-lg border p-3">
      <div className="text-sm font-semibold">{title}</div>
      <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
        {MONTHS.map((month, idx) => (
          <div key={month} className="rounded border p-2">
            <div className="text-[11px] opacity-70">{helper}</div>
            <label className="block mt-1">
              <div className="text-xs font-semibold mb-1">{month}</div>
              <input
                className="w-full rounded border px-2 py-1.5 text-sm"
                type="number"
                step={step}
                value={Number.isFinite(values[idx]) ? values[idx] : 0}
                onChange={(e) => onChange(idx, Number(e.target.value))}
              />
            </label>
          </div>
        ))}
      </div>
    </div>
  );
}

function normalizeMonthArray(values: number[], defaultValue: number): number[] {
  const out = new Array<number>(12);
  for (let i = 0; i < 12; i++) {
    const x = values[i];
    out[i] = Number.isFinite(x) ? x : defaultValue;
  }
  return out;
}

function clampNum(x: number, lo: number, hi: number): number {
  if (!Number.isFinite(x)) return lo;
  return Math.max(lo, Math.min(hi, x));
}

function clampInt(x: number, lo: number, hi: number): number {
  const n = Math.round(x);
  if (!Number.isFinite(n)) return lo;
  return Math.max(lo, Math.min(hi, n));
}

export { DEFAULT_VEHICLE_CLASSES };
