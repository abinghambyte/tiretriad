import { MODULE_MATRIX } from '../../constants/peoplePermissions'

/**
 * @param {object} props
 * @param {Record<string, string>} props.value permissions map
 * @param {(next: Record<string, string>) => void} props.onChange
 * @param {boolean} [props.disabled]
 */
export function PermissionMatrix({ value, onChange, disabled }) {
  return (
    <div>
      <p className="mb-3 text-xs font-medium uppercase tracking-wide text-zinc-400">
        Permission matrix
      </p>
      <div className="rounded-lg border border-zinc-800 bg-zinc-900/40 divide-y divide-zinc-800">
        {MODULE_MATRIX.map((row) => (
          <div
            key={row.key}
            className="flex items-center justify-between gap-2 px-3 py-2.5"
          >
            <span className="text-sm font-medium text-zinc-200 w-28 shrink-0">{row.label}</span>
            <div className="flex flex-wrap gap-x-4 gap-y-1 justify-end">
              {row.levels.map((lvl) => (
                <label
                  key={lvl}
                  className={`inline-flex cursor-pointer items-center gap-1 text-xs ${
                    disabled ? 'cursor-not-allowed opacity-50' : 'text-zinc-300'
                  }`}
                >
                  <input
                    type="radio"
                    className="accent-amber-500"
                    name={`perm-${row.key}`}
                    checked={(value[row.key] || 'none') === lvl}
                    disabled={disabled}
                    onChange={() => onChange({ ...value, [row.key]: lvl })}
                  />
                  <span className="capitalize">{lvl}</span>
                </label>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
