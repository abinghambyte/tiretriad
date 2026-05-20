import { httpsCallable } from 'firebase/functions'
import { useCallback, useMemo, useState } from 'react'
import { functions } from '../firebase/config'
import { formatPhoneInputForDisplay } from '../utils/formatPhone.js'

const submitMechanicIntake = httpsCallable(functions, 'submitMechanicIntake')

const inputClass =
  'min-h-[44px] w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 text-base text-zinc-100 outline-none placeholder:text-zinc-600 focus:border-amber-600/60'
const labelClass = 'mb-1.5 block text-sm font-medium text-zinc-300'
const cardClass = 'rounded-2xl border border-zinc-800 bg-zinc-900 p-6 shadow-sm'

const STEP2_SERVICES = [
  { id: 'tire_install_only', label: 'Tire install only' },
  { id: 'mount_balance', label: 'Mount + balance' },
  { id: 'flat_repair', label: 'Flat repair' },
  { id: 'tpms_reset', label: 'TPMS reset / programming' },
  { id: 'roadside_emergency', label: 'Roadside emergency replacement' },
  { id: 'battery_brake_light', label: 'Battery / brake / light mechanical work' },
]

const STEP2_VEHICLES = [
  { id: 'passenger_cars', label: 'Passenger cars' },
  { id: 'suv_light_trucks', label: 'SUVs / light trucks' },
  { id: 'sprinter_transit', label: 'Sprinter / Transit vans' },
  { id: 'one_ton', label: '1-ton trucks (F-350 / Ram 3500)' },
  { id: 'medium_duty', label: 'Medium duty (box trucks)' },
  { id: 'heavy_duty', label: 'Heavy duty (semi / 11R22.5 / 11R24.5)' },
  { id: 'super_singles_class', label: 'Super singles (445+ wide base)' },
]

const PRICING_OPTIONS = [
  { id: 'flat_per_tire', label: 'Flat per tire' },
  { id: 'hourly_labor', label: 'Hourly labor' },
  { id: 'per_job_flat', label: 'Per job flat fee' },
  { id: 'fleet_contract', label: 'Fleet contract pricing' },
]

const EXCLUSION_OPTIONS = [
  { id: 'super_singles', label: 'Super singles' },
  { id: 'rusted_bead', label: 'Rusted bead wheels' },
  { id: 'roadside_highway_semis', label: 'Roadside highway semis' },
  { id: 'overloaded_rvs', label: 'Overloaded RVs' },
  { id: 'other', label: 'Other' },
]

function todayLabel() {
  return new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
}

function initialForm() {
  const emptyLd = () => ({ laborCost: '', mobileSurcharge: '', installTime: '' })
  const emptyLt = () => ({ totalLaborCost: '', notes: '' })
  const emptyTbr = () => ({ totalLaborCost: '', torqueRecheck: false, avgTimePerTire: '' })
  const emptySs = () => ({ totalCost: '', safetyRiskPremium: '' })
  return {
    step1: {
      name: '',
      phone: '',
      businessName: '',
      baseLocation: '',
      yearsExperience: '',
    },
    step2: {
      services: [],
      vehicleClasses: [],
      equipment: {
        tireMachineType: '',
        balancerType: '',
        airCompressorCfm: '',
        torqueTools: '',
        jackingCapacity: '',
        generator: false,
      },
    },
    step3: {
      laborRates: {
        passenger: '',
        suvLt: '',
        commercialVan: '',
        tbr: '',
        superSingle: '',
      },
      callOutFees: {
        within10: '',
        miles10to25: '',
        miles25to50: '',
        miles50plus: '',
      },
      emergencyMultipliers: {
        standard: '',
        afterHours: '',
        weekend: '',
      },
    },
    step4: {
      fleetMatrix: {
        lightDuty: {
          '225/75R16C': emptyLd(),
          '235/65R16C': emptyLd(),
          'LT215/85R16': emptyLd(),
        },
        lightTruck: {
          '275/70R18': emptyLt(),
          '285/70R17': emptyLt(),
          '35x12.50R20': emptyLt(),
        },
        tbrCommercial: {
          '11R22.5 Steer': emptyTbr(),
          '11R22.5 Drive': emptyTbr(),
          '11R24.5': emptyTbr(),
          'Trailer tires': emptyTbr(),
        },
        superSingles: {
          '445/50R22.5': emptySs(),
          '455/55R22.5': emptySs(),
        },
      },
    },
    step5: {
      serviceRadius: {
        fortCollins: '',
        greeley: '',
        loveland: '',
        denverEdge: '',
      },
      servicesOffered: {
        tirePickupWarehouse: false,
        deliveryFleetYard: false,
        emergencyRoadside: false,
      },
      capacity: {
        standardJobsPerDay: '',
        peakJobsPerDay: '',
      },
      pricingPreference: '',
      fleetOptions: {
        fleetDiscount: false,
        fleetDiscountNotes: '',
        monthlyRetainerDsp: false,
        monthlyRetainerNotes: '',
        volumeTiers: false,
        volumeTiersNotes: '',
      },
      exclusions: [],
      exclusionsOther: '',
    },
  }
}

function ToggleYesNo({ value, onChange, label }) {
  return (
    <div className="flex flex-col gap-2">
      <span className={labelClass}>{label}</span>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => onChange(true)}
          className={`min-h-[44px] flex-1 rounded-xl border px-3 text-sm font-medium transition ${
            value ? 'border-amber-500 bg-amber-950/40 text-amber-100' : 'border-zinc-700 text-zinc-400'
          }`}
        >
          Yes
        </button>
        <button
          type="button"
          onClick={() => onChange(false)}
          className={`min-h-[44px] flex-1 rounded-xl border px-3 text-sm font-medium transition ${
            !value ? 'border-amber-500 bg-amber-950/40 text-amber-100' : 'border-zinc-700 text-zinc-400'
          }`}
        >
          No
        </button>
      </div>
    </div>
  )
}

function BigCheckbox({ checked, onChange, label }) {
  return (
    <label className="flex min-h-[44px] cursor-pointer items-center gap-3 rounded-xl border border-zinc-800 bg-zinc-950/60 px-3 py-2 has-[:checked]:border-amber-700/50 has-[:checked]:bg-amber-950/20">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="h-5 w-5 shrink-0 rounded border-zinc-600 accent-amber-500"
      />
      <span className="text-base text-zinc-200">{label}</span>
    </label>
  )
}

function CurrencyField({ label, value, onChange, placeholder = '0' }) {
  return (
    <label className="block">
      <span className={labelClass}>{label}</span>
      <div className="flex items-stretch overflow-hidden rounded-xl border border-zinc-700 bg-zinc-950 focus-within:border-amber-600/60">
        <span className="flex min-h-[44px] items-center border-r border-zinc-800 px-3 text-base text-zinc-400">
          $
        </span>
        <input
          type="text"
          inputMode="decimal"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="min-h-[44px] flex-1 border-0 bg-transparent px-3 text-base text-zinc-100 outline-none"
        />
      </div>
    </label>
  )
}

export function MechanicIntakePage() {
  const [step, setStep] = useState(0)
  const [form, setForm] = useState(initialForm)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)

  const progressPct = useMemo(() => ((step + 1) / 5) * 100, [step])

  const setStep1 = useCallback((patch) => {
    setForm((f) => ({ ...f, step1: { ...f.step1, ...patch } }))
  }, [])

  const setEquipment = useCallback((patch) => {
    setForm((f) => ({ ...f, step2: { ...f.step2, equipment: { ...f.step2.equipment, ...patch } } }))
  }, [])

  const setStep3 = useCallback((section, patch) => {
    setForm((f) => ({
      ...f,
      step3: { ...f.step3, [section]: { ...f.step3[section], ...patch } },
    }))
  }, [])

  const setFleetCell = useCallback((section, tireKey, patch) => {
    setForm((f) => ({
      ...f,
      step4: {
        ...f.step4,
        fleetMatrix: {
          ...f.step4.fleetMatrix,
          [section]: {
            ...f.step4.fleetMatrix[section],
            [tireKey]: { ...f.step4.fleetMatrix[section][tireKey], ...patch },
          },
        },
      },
    }))
  }, [])

  const setStep5 = useCallback((patch) => {
    setForm((f) => ({ ...f, step5: { ...f.step5, ...patch } }))
  }, [])

  const setStep5Nested = useCallback((key, patch) => {
    setForm((f) => ({
      ...f,
      step5: { ...f.step5, [key]: { ...f.step5[key], ...patch } },
    }))
  }, [])

  async function handleSubmit() {
    setError('')
    setSubmitting(true)
    try {
      await submitMechanicIntake({
        step1: form.step1,
        step2: form.step2,
        step3: form.step3,
        step4: form.step4,
        step5: form.step5,
      })
      setDone(true)
    } catch (e) {
      setError(e?.message || 'Something went wrong. Try again.')
    } finally {
      setSubmitting(false)
    }
  }

  if (done) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-zinc-950 px-6 text-center text-zinc-100">
        <p className="text-lg font-medium text-zinc-100">Submitted. We&apos;ll be in touch.</p>
        <p className="mt-3 max-w-md text-sm text-zinc-400">
          Thanks for completing the mechanic intake. Our fleet team will follow up using the phone
          number you provided.
        </p>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-zinc-950 pb-28 text-zinc-100">
      <div className="mx-auto max-w-lg px-4 pt-6 sm:px-6 sm:pt-10">
        {step === 0 ? (
          <p className="mb-6 text-center text-xs font-semibold uppercase tracking-[0.35em] text-zinc-400">
            Tire Triad
          </p>
        ) : (
          <div className="mb-4 h-4" aria-hidden />
        )}

        <div className="mb-6">
          <div className="mb-2 flex items-center justify-between text-xs text-zinc-400">
            <span>
              Step {step + 1} of 5
            </span>
          </div>
          <div className="h-1 overflow-hidden rounded-full bg-zinc-800">
            <div
              className="h-full rounded-full bg-amber-500 transition-[width] duration-300"
              style={{ width: `${progressPct}%` }}
            />
          </div>
        </div>

        {error ? (
          <p className="mb-4 rounded-xl border border-red-900/50 bg-red-950/30 px-4 py-3 text-sm text-red-200">
            {error}
          </p>
        ) : null}

        <div className={cardClass}>
          {step === 0 ? (
            <div className="space-y-4">
              <h1 className="text-lg font-semibold text-white">Basic info</h1>
              <label className="block">
                <span className={labelClass}>Your name</span>
                <input
                  type="text"
                  value={form.step1.name}
                  onChange={(e) => setStep1({ name: e.target.value })}
                  className={inputClass}
                  autoComplete="name"
                />
              </label>
              <label className="block">
                <span className={labelClass}>Phone number</span>
                <input
                  type="tel"
                  inputMode="tel"
                  value={formatPhoneInputForDisplay(form.step1.phone)}
                  onChange={(e) => {
                    const all = String(e.target.value || '').replace(/\D/g, '')
                    const national = all.startsWith('1') ? all.slice(1) : all
                    setStep1({ phone: formatPhoneInputForDisplay(national.slice(0, 10)) })
                  }}
                  className={inputClass}
                  autoComplete="tel"
                  placeholder="+1 (555) 123-4567"
                />
              </label>
              <label className="block">
                <span className={labelClass}>Business name</span>
                <input
                  type="text"
                  value={form.step1.businessName}
                  onChange={(e) => setStep1({ businessName: e.target.value })}
                  placeholder="On Road Service or leave blank"
                  className={inputClass}
                />
              </label>
              <label className="block">
                <span className={labelClass}>Primary base location</span>
                <input
                  type="text"
                  value={form.step1.baseLocation}
                  onChange={(e) => setStep1({ baseLocation: e.target.value })}
                  placeholder="Fort Collins, Greeley, etc."
                  className={inputClass}
                />
              </label>
              <label className="block">
                <span className={labelClass}>Years of mobile experience</span>
                <input
                  type="number"
                  min={0}
                  step={1}
                  value={form.step1.yearsExperience}
                  onChange={(e) => setStep1({ yearsExperience: e.target.value })}
                  className={inputClass}
                />
              </label>
              <div>
                <span className={labelClass}>Date</span>
                <p className="min-h-[44px] rounded-xl border border-zinc-800 bg-zinc-950/50 px-3 py-2.5 text-base text-zinc-400">
                  {todayLabel()}
                </p>
              </div>
            </div>
          ) : null}

          {step === 1 ? (
            <div className="space-y-8">
              <h1 className="text-lg font-semibold text-white">Capabilities</h1>
              <div>
                <p className="mb-3 text-sm font-medium text-zinc-400">Services</p>
                <div className="grid gap-2">
                  {STEP2_SERVICES.map((s) => (
                    <BigCheckbox
                      key={s.id}
                      checked={form.step2.services.includes(s.id)}
                      onChange={(on) =>
                        setForm((f) => {
                          const arr = new Set(f.step2.services)
                          if (on) arr.add(s.id)
                          else arr.delete(s.id)
                          return { ...f, step2: { ...f.step2, services: [...arr] } }
                        })
                      }
                      label={s.label}
                    />
                  ))}
                </div>
              </div>
              <div>
                <p className="mb-3 text-sm font-medium text-zinc-400">Vehicle classes</p>
                <div className="grid gap-2">
                  {STEP2_VEHICLES.map((s) => (
                    <BigCheckbox
                      key={s.id}
                      checked={form.step2.vehicleClasses.includes(s.id)}
                      onChange={(on) =>
                        setForm((f) => {
                          const arr = new Set(f.step2.vehicleClasses)
                          if (on) arr.add(s.id)
                          else arr.delete(s.id)
                          return { ...f, step2: { ...f.step2, vehicleClasses: [...arr] } }
                        })
                      }
                      label={s.label}
                    />
                  ))}
                </div>
              </div>
              <div>
                <p className="mb-3 text-sm font-medium text-zinc-400">Equipment (optional)</p>
                <div className="space-y-3">
                  <label className="block">
                    <span className={labelClass}>Tire machine type</span>
                    <input
                      type="text"
                      value={form.step2.equipment.tireMachineType}
                      onChange={(e) => setEquipment({ tireMachineType: e.target.value })}
                      className={inputClass}
                    />
                  </label>
                  <label className="block">
                    <span className={labelClass}>Balancer type</span>
                    <input
                      type="text"
                      value={form.step2.equipment.balancerType}
                      onChange={(e) => setEquipment({ balancerType: e.target.value })}
                      className={inputClass}
                    />
                  </label>
                  <label className="block">
                    <span className={labelClass}>Air compressor CFM rating</span>
                    <input
                      type="text"
                      value={form.step2.equipment.airCompressorCfm}
                      onChange={(e) => setEquipment({ airCompressorCfm: e.target.value })}
                      className={inputClass}
                    />
                  </label>
                  <label className="block">
                    <span className={labelClass}>Torque tools</span>
                    <input
                      type="text"
                      value={form.step2.equipment.torqueTools}
                      onChange={(e) => setEquipment({ torqueTools: e.target.value })}
                      className={inputClass}
                    />
                  </label>
                  <label className="block">
                    <span className={labelClass}>Jacking capacity (max vehicle weight)</span>
                    <input
                      type="text"
                      value={form.step2.equipment.jackingCapacity}
                      onChange={(e) => setEquipment({ jackingCapacity: e.target.value })}
                      className={inputClass}
                    />
                  </label>
                  <ToggleYesNo
                    label="Generator"
                    value={form.step2.equipment.generator}
                    onChange={(v) => setEquipment({ generator: v })}
                  />
                </div>
              </div>
            </div>
          ) : null}

          {step === 2 ? (
            <div className="space-y-6">
              <h1 className="text-lg font-semibold text-white">Core pricing</h1>
              <div>
                <p className="mb-3 text-sm font-medium text-amber-200/80">Base labor per tire</p>
                <div className="space-y-3">
                  <CurrencyField
                    label="Passenger"
                    value={form.step3.laborRates.passenger}
                    onChange={(v) => setStep3('laborRates', { passenger: v })}
                  />
                  <CurrencyField
                    label="SUV / LT"
                    value={form.step3.laborRates.suvLt}
                    onChange={(v) => setStep3('laborRates', { suvLt: v })}
                  />
                  <CurrencyField
                    label="Commercial van"
                    value={form.step3.laborRates.commercialVan}
                    onChange={(v) => setStep3('laborRates', { commercialVan: v })}
                  />
                  <CurrencyField
                    label="TBR (semi truck)"
                    value={form.step3.laborRates.tbr}
                    onChange={(v) => setStep3('laborRates', { tbr: v })}
                  />
                  <CurrencyField
                    label="Super single"
                    value={form.step3.laborRates.superSingle}
                    onChange={(v) => setStep3('laborRates', { superSingle: v })}
                  />
                </div>
              </div>
              <div>
                <p className="mb-3 text-sm font-medium text-amber-200/80">Call-out fee by distance</p>
                <div className="space-y-3">
                  <CurrencyField
                    label="Within 10 miles"
                    value={form.step3.callOutFees.within10}
                    onChange={(v) => setStep3('callOutFees', { within10: v })}
                  />
                  <CurrencyField
                    label="10–25 miles"
                    value={form.step3.callOutFees.miles10to25}
                    onChange={(v) => setStep3('callOutFees', { miles10to25: v })}
                  />
                  <CurrencyField
                    label="25–50 miles"
                    value={form.step3.callOutFees.miles25to50}
                    onChange={(v) => setStep3('callOutFees', { miles25to50: v })}
                  />
                  <CurrencyField
                    label="50+ miles"
                    value={form.step3.callOutFees.miles50plus}
                    onChange={(v) => setStep3('callOutFees', { miles50plus: v })}
                  />
                </div>
              </div>
              <div>
                <p className="mb-3 text-sm font-medium text-amber-200/80">Emergency multipliers (e.g. 1.5)</p>
                <div className="space-y-3">
                  <label className="block">
                    <span className={labelClass}>Standard hours</span>
                    <input
                      type="text"
                      inputMode="decimal"
                      value={form.step3.emergencyMultipliers.standard}
                      onChange={(e) => setStep3('emergencyMultipliers', { standard: e.target.value })}
                      className={inputClass}
                    />
                  </label>
                  <label className="block">
                    <span className={labelClass}>After-hours</span>
                    <input
                      type="text"
                      inputMode="decimal"
                      value={form.step3.emergencyMultipliers.afterHours}
                      onChange={(e) => setStep3('emergencyMultipliers', { afterHours: e.target.value })}
                      className={inputClass}
                    />
                  </label>
                  <label className="block">
                    <span className={labelClass}>Weekend</span>
                    <input
                      type="text"
                      inputMode="decimal"
                      value={form.step3.emergencyMultipliers.weekend}
                      onChange={(e) => setStep3('emergencyMultipliers', { weekend: e.target.value })}
                      className={inputClass}
                    />
                  </label>
                </div>
              </div>
            </div>
          ) : null}

          {step === 3 ? (
            <div className="space-y-8">
              <h1 className="text-lg font-semibold text-white">Fleet matrix</h1>

              <div>
                <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-zinc-400">
                  Light duty fleet
                </h2>
                <div className="space-y-4">
                  {Object.entries(form.step4.fleetMatrix.lightDuty).map(([tire, row]) => (
                    <div key={tire} className="rounded-xl border border-zinc-800 bg-zinc-950/40 p-4">
                      <p className="mb-3 font-mono text-sm font-semibold text-amber-200/90">{tire}</p>
                      <div className="space-y-3">
                        <CurrencyField
                          label="Labor cost"
                          value={row.laborCost}
                          onChange={(v) => setFleetCell('lightDuty', tire, { laborCost: v })}
                        />
                        <CurrencyField
                          label="Mobile surcharge"
                          value={row.mobileSurcharge}
                          onChange={(v) => setFleetCell('lightDuty', tire, { mobileSurcharge: v })}
                        />
                        <label className="block">
                          <span className={labelClass}>Install time</span>
                          <input
                            type="text"
                            value={row.installTime}
                            onChange={(e) =>
                              setFleetCell('lightDuty', tire, { installTime: e.target.value })
                            }
                            className={inputClass}
                          />
                        </label>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-zinc-400">
                  Light truck
                </h2>
                <div className="space-y-4">
                  {Object.entries(form.step4.fleetMatrix.lightTruck).map(([tire, row]) => (
                    <div key={tire} className="rounded-xl border border-zinc-800 bg-zinc-950/40 p-4">
                      <p className="mb-3 font-mono text-sm font-semibold text-amber-200/90">{tire}</p>
                      <div className="space-y-3">
                        <CurrencyField
                          label="Total labor cost"
                          value={row.totalLaborCost}
                          onChange={(v) => setFleetCell('lightTruck', tire, { totalLaborCost: v })}
                        />
                        <label className="block">
                          <span className={labelClass}>Notes</span>
                          <input
                            type="text"
                            value={row.notes}
                            onChange={(e) => setFleetCell('lightTruck', tire, { notes: e.target.value })}
                            className={inputClass}
                          />
                        </label>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-zinc-400">
                  TBR / commercial
                </h2>
                <div className="space-y-4">
                  {Object.entries(form.step4.fleetMatrix.tbrCommercial).map(([tire, row]) => (
                    <div key={tire} className="rounded-xl border border-zinc-800 bg-zinc-950/40 p-4">
                      <p className="mb-3 font-mono text-sm font-semibold text-amber-200/90">{tire}</p>
                      <div className="space-y-3">
                        <CurrencyField
                          label="Total labor cost"
                          value={row.totalLaborCost}
                          onChange={(v) => setFleetCell('tbrCommercial', tire, { totalLaborCost: v })}
                        />
                        <ToggleYesNo
                          label="Torque recheck"
                          value={row.torqueRecheck}
                          onChange={(v) => setFleetCell('tbrCommercial', tire, { torqueRecheck: v })}
                        />
                        <label className="block">
                          <span className={labelClass}>Avg time per tire</span>
                          <input
                            type="text"
                            value={row.avgTimePerTire}
                            onChange={(e) =>
                              setFleetCell('tbrCommercial', tire, { avgTimePerTire: e.target.value })
                            }
                            className={inputClass}
                          />
                        </label>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-zinc-400">
                  Super singles
                </h2>
                <div className="space-y-4">
                  {Object.entries(form.step4.fleetMatrix.superSingles).map(([tire, row]) => (
                    <div key={tire} className="rounded-xl border border-zinc-800 bg-zinc-950/40 p-4">
                      <p className="mb-3 font-mono text-sm font-semibold text-amber-200/90">{tire}</p>
                      <div className="space-y-3">
                        <CurrencyField
                          label="Total cost"
                          value={row.totalCost}
                          onChange={(v) => setFleetCell('superSingles', tire, { totalCost: v })}
                        />
                        <CurrencyField
                          label="Safety risk premium"
                          value={row.safetyRiskPremium}
                          onChange={(v) => setFleetCell('superSingles', tire, { safetyRiskPremium: v })}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ) : null}

          {step === 4 ? (
            <div className="space-y-8">
              <h1 className="text-lg font-semibold text-white">Logistics + wrap-up</h1>
              <div>
                <p className="mb-3 text-sm font-medium text-zinc-400">Service radius (miles)</p>
                <div className="space-y-3">
                  {[
                    ['fortCollins', 'Fort Collins base'],
                    ['greeley', 'Greeley'],
                    ['loveland', 'Loveland'],
                    ['denverEdge', 'Denver edge'],
                  ].map(([key, lab]) => (
                    <label key={key} className="block">
                      <span className={labelClass}>{lab}</span>
                      <input
                        type="number"
                        min={0}
                        value={form.step5.serviceRadius[key]}
                        onChange={(e) =>
                          setStep5Nested('serviceRadius', { [key]: e.target.value })
                        }
                        className={inputClass}
                      />
                    </label>
                  ))}
                </div>
              </div>
              <div>
                <p className="mb-3 text-sm font-medium text-zinc-400">Services offered</p>
                <div className="space-y-4">
                  <ToggleYesNo
                    label="Tire pickup from warehouse"
                    value={form.step5.servicesOffered.tirePickupWarehouse}
                    onChange={(v) =>
                      setStep5Nested('servicesOffered', { tirePickupWarehouse: v })
                    }
                  />
                  <ToggleYesNo
                    label="Delivery to fleet yard"
                    value={form.step5.servicesOffered.deliveryFleetYard}
                    onChange={(v) =>
                      setStep5Nested('servicesOffered', { deliveryFleetYard: v })
                    }
                  />
                  <ToggleYesNo
                    label="Emergency roadside dispatch"
                    value={form.step5.servicesOffered.emergencyRoadside}
                    onChange={(v) =>
                      setStep5Nested('servicesOffered', { emergencyRoadside: v })
                    }
                  />
                </div>
              </div>
              <div>
                <p className="mb-3 text-sm font-medium text-zinc-400">Capacity</p>
                <div className="space-y-3">
                  <label className="block">
                    <span className={labelClass}>Standard jobs per day</span>
                    <input
                      type="number"
                      min={0}
                      value={form.step5.capacity.standardJobsPerDay}
                      onChange={(e) =>
                        setStep5Nested('capacity', { standardJobsPerDay: e.target.value })
                      }
                      className={inputClass}
                    />
                  </label>
                  <label className="block">
                    <span className={labelClass}>Peak capacity jobs per day</span>
                    <input
                      type="number"
                      min={0}
                      value={form.step5.capacity.peakJobsPerDay}
                      onChange={(e) =>
                        setStep5Nested('capacity', { peakJobsPerDay: e.target.value })
                      }
                      className={inputClass}
                    />
                  </label>
                </div>
              </div>
              <div>
                <p className="mb-3 text-sm font-medium text-zinc-400">Pricing preference</p>
                <div className="grid gap-2">
                  {PRICING_OPTIONS.map((o) => (
                    <label
                      key={o.id}
                      className={`flex min-h-[44px] cursor-pointer items-center gap-3 rounded-xl border px-3 ${
                        form.step5.pricingPreference === o.id
                          ? 'border-amber-500 bg-amber-950/30'
                          : 'border-zinc-800 bg-zinc-950/50'
                      }`}
                    >
                      <input
                        type="radio"
                        name="pricing-pref"
                        checked={form.step5.pricingPreference === o.id}
                        onChange={() => setStep5({ pricingPreference: o.id })}
                        className="h-5 w-5 accent-amber-500"
                      />
                      <span className="text-base text-zinc-200">{o.label}</span>
                    </label>
                  ))}
                </div>
              </div>
              <div>
                <p className="mb-3 text-sm font-medium text-zinc-400">Willing to offer</p>
                <div className="space-y-4">
                  <ToggleYesNo
                    label="Fleet discount"
                    value={form.step5.fleetOptions.fleetDiscount}
                    onChange={(v) => setStep5Nested('fleetOptions', { fleetDiscount: v })}
                  />
                  {form.step5.fleetOptions.fleetDiscount ? (
                    <label className="block">
                      <span className={labelClass}>Fleet discount notes</span>
                      <input
                        type="text"
                        value={form.step5.fleetOptions.fleetDiscountNotes}
                        onChange={(e) =>
                          setStep5Nested('fleetOptions', { fleetDiscountNotes: e.target.value })
                        }
                        className={inputClass}
                      />
                    </label>
                  ) : null}
                  <ToggleYesNo
                    label="Monthly retainer for DSP operators"
                    value={form.step5.fleetOptions.monthlyRetainerDsp}
                    onChange={(v) => setStep5Nested('fleetOptions', { monthlyRetainerDsp: v })}
                  />
                  {form.step5.fleetOptions.monthlyRetainerDsp ? (
                    <label className="block">
                      <span className={labelClass}>Retainer notes</span>
                      <input
                        type="text"
                        value={form.step5.fleetOptions.monthlyRetainerNotes}
                        onChange={(e) =>
                          setStep5Nested('fleetOptions', { monthlyRetainerNotes: e.target.value })
                        }
                        className={inputClass}
                      />
                    </label>
                  ) : null}
                  <ToggleYesNo
                    label="Volume pricing tiers"
                    value={form.step5.fleetOptions.volumeTiers}
                    onChange={(v) => setStep5Nested('fleetOptions', { volumeTiers: v })}
                  />
                  {form.step5.fleetOptions.volumeTiers ? (
                    <label className="block">
                      <span className={labelClass}>Volume tiers notes</span>
                      <input
                        type="text"
                        value={form.step5.fleetOptions.volumeTiersNotes}
                        onChange={(e) =>
                          setStep5Nested('fleetOptions', { volumeTiersNotes: e.target.value })
                        }
                        className={inputClass}
                      />
                    </label>
                  ) : null}
                </div>
              </div>
              <div>
                <p className="mb-3 text-sm font-medium text-zinc-400">Jobs you will NOT service</p>
                <div className="grid gap-2">
                  {EXCLUSION_OPTIONS.map((o) => (
                    <BigCheckbox
                      key={o.id}
                      checked={form.step5.exclusions.includes(o.id)}
                      onChange={(on) =>
                        setForm((f) => {
                          const next = new Set(f.step5.exclusions)
                          if (on) next.add(o.id)
                          else next.delete(o.id)
                          return { ...f, step5: { ...f.step5, exclusions: [...next] } }
                        })
                      }
                      label={o.label}
                    />
                  ))}
                </div>
                {form.step5.exclusions.includes('other') ? (
                  <label className="mt-3 block">
                    <span className={labelClass}>Other (describe)</span>
                    <input
                      type="text"
                      value={form.step5.exclusionsOther}
                      onChange={(e) => setStep5({ exclusionsOther: e.target.value })}
                      className={inputClass}
                    />
                  </label>
                ) : null}
              </div>
            </div>
          ) : null}
        </div>
      </div>

      <div className="fixed bottom-0 left-0 right-0 z-40 border-t border-zinc-800 bg-zinc-950/95 px-4 py-3 backdrop-blur-md sm:px-6">
        <div className="mx-auto flex max-w-lg gap-3">
          <button
            type="button"
            disabled={step === 0}
            onClick={() => setStep((s) => Math.max(0, s - 1))}
            className="min-h-[48px] flex-1 rounded-xl border border-zinc-600 text-sm font-medium text-zinc-200 disabled:opacity-30"
          >
            Back
          </button>
          {step < 4 ? (
            <button
              type="button"
              onClick={() => setStep((s) => Math.min(4, s + 1))}
              className="min-h-[48px] flex-1 rounded-xl bg-amber-500 text-sm font-semibold text-zinc-950 hover:bg-amber-400"
            >
              Next
            </button>
          ) : (
            <button
              type="button"
              disabled={submitting}
              onClick={() => void handleSubmit()}
              className="min-h-[48px] flex-1 rounded-xl bg-amber-500 text-sm font-semibold text-zinc-950 hover:bg-amber-400 disabled:opacity-50"
            >
              {submitting ? 'Submitting…' : 'Submit'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
