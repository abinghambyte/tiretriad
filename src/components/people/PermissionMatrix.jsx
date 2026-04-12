import { MODULE_MATRIX } from '../../constants/peoplePermissions'

/**
 * @param {object} props
 * @param {Record<string, string>} props.value permissions map
 * @param {(next: Record<string, string>) => void} props.onChange
 * @param {boolean} [props.disabled]
 */
export function PermissionMatrix({ value, onChange, disabled }) {
  return (
    <div className="space-y-4">
      <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">
        Permission matrix
      </p>
      {MODULE_MATRIX.map((row) => (
        <div
          key={row.key}
          className="flex flex-col gap-2 border-b border-zinc-800/80 pb-3 last:border-0 sm:flex-row sm:items-center sm:justify-between"
        >
          <span className="text-sm font-medium text-zinc-200">{row.label}</span>
          <div className="flex flex-wrap gap-3">
            {row.levels.map((lvl) => (
              <label
                key={lvl}
                className={`inline-flex cursor-pointer items-center gap-1.5 text-xs ${
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
  )
}
