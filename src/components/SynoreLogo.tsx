import React from 'react';

export function SynoreLogo({
  collapsed = false,
  size = 28,
}: {
  collapsed?: boolean;
  size?: number;
}) {
  return (
    <div className="flex items-center gap-2.5 select-none shrink-0">
      <svg
        width={size}
        height={size}
        viewBox="0 0 32 32"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
        className="shrink-0"
      >
        <rect width="32" height="32" rx="8" fill="#182032" />
        <path
          d="M16 5.5L25.5 11V21L16 26.5L6.5 21V11L16 5.5Z"
          stroke="#3B82F6"
          strokeWidth="1.75"
          strokeLinejoin="round"
        />
        <path
          d="M16 5.5V16M16 16L25.5 11M16 16L6.5 21"
          stroke="#60A5FA"
          strokeWidth="1.75"
          strokeLinecap="round"
        />
        <circle cx="16" cy="16" r="2.75" fill="#F8FAFC" />
      </svg>
      {!collapsed && (
        <span className="font-display text-[17px] font-bold tracking-tight text-slate-900 dark:text-slate-50 whitespace-nowrap">
          Synore
        </span>
      )}
    </div>
  );
}

export function UserAvatar({
  name,
  avatarUrl,
  size = 'md',
  online,
}: {
  name: string;
  avatarUrl?: string | null;
  size?: 'xs' | 'sm' | 'md' | 'lg';
  online?: boolean;
}) {
  const [imgError, setImgError] = React.useState(false);
  const sizeClass =
    size === 'xs'
      ? 'w-5 h-5 text-[10px]'
      : size === 'sm'
      ? 'w-7 h-7 text-xs'
      : size === 'lg'
      ? 'w-11 h-11 text-sm'
      : 'w-8 h-8 text-xs';

  const initials = (name || 'U')
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0].toUpperCase())
    .join('');

  return (
    <div className="relative inline-flex shrink-0">
      {avatarUrl && !imgError ? (
        <img
          src={avatarUrl}
          alt={name}
          referrerPolicy="no-referrer"
          onError={() => setImgError(true)}
          className={`${sizeClass} rounded-full object-cover border border-slate-200 dark:border-slate-700 bg-slate-200 dark:bg-slate-800`}
        />
      ) : (
        <div
          className={`${sizeClass} rounded-full flex items-center justify-center font-semibold bg-blue-600/15 text-blue-700 dark:text-blue-300 border border-blue-500/20`}
        >
          {initials}
        </div>
      )}
      {online !== undefined && (
        <span
          title={online ? 'Online' : 'Offline'}
          className={`absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full ring-2 ring-white dark:ring-[#13161F] ${
            online ? 'bg-emerald-500' : 'bg-slate-400 dark:bg-slate-600'
          }`}
        />
      )}
    </div>
  );
}
