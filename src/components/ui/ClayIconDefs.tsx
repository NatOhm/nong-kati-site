/**
 * Shared SVG gradient registry — rendered EXACTLY ONCE by the root layout.
 *
 * ClayIcons instances reference gradients via url(#id). Before this file
 * existed, every icon instance shipped its own <defs> copy, so any page
 * rendering an icon twice duplicated DOM ids (a11y / WCAG 4.1.1 violation
 * caught by the duplicate-ID gate). SVG paint-server references resolve
 * against the whole document, so one document-level <defs> serves every
 * instance — and per-instance defs are no longer needed.
 *
 * Covered ids: acornShade, capShade, hamsterFaceBody, hamsterBody,
 * hamsterLauncher, hamsterSleep, hamsterCheer, hamsterWorry, wheelShade.
 *
 * Guarded by the R6 static gate: this is the only component file allowed to
 * declare literal id= attributes.
 */
export function ClayIconDefs(): React.JSX.Element {
  return (
    <svg
      data-testid="clay-icon-defs"
      aria-hidden="true"
      focusable="false"
      style={{ position: 'absolute', width: 0, height: 0, overflow: 'hidden' }}
    >
      <defs>
        {/* Acorn icon (Rewards) */}
        <radialGradient id="acornShade" cx="0.35" cy="0.3" r="1">
          <stop offset="0" stopColor="#E8B76E" />
          <stop offset="1" stopColor="#C4853F" />
        </radialGradient>
        <radialGradient id="capShade" cx="0.35" cy="0.25" r="1">
          <stop offset="0" stopColor="#A06A35" />
          <stop offset="1" stopColor="#6B421C" />
        </radialGradient>
        {/* Hamster face (logo / toasts) */}
        <radialGradient id="hamsterFaceBody" cx="0.32" cy="0.24" r="1.15">
          <stop offset="0" stopColor="#FED7AA" />
          <stop offset="1" stopColor="#FB923C" />
        </radialGradient>
        {/* Hamster mascot (launcher / empty states) */}
        <radialGradient id="hamsterBody" cx="0.35" cy="0.25" r="1.1">
          <stop offset="0" stopColor="#FED7AA" />
          <stop offset="1" stopColor="#FB923C" />
        </radialGradient>
        {/* Sleeping hamster */}
        <radialGradient id="hamsterSleep" cx="0.35" cy="0.25" r="1.1">
          <stop offset="0" stopColor="#FED7AA" />
          <stop offset="1" stopColor="#FB923C" />
        </radialGradient>
        {/* Celebrating hamster */}
        <radialGradient id="hamsterCheer" cx="0.35" cy="0.25" r="1.1">
          <stop offset="0" stopColor="#FED7AA" />
          <stop offset="1" stopColor="#FB923C" />
        </radialGradient>
        {/* Worried hamster */}
        <radialGradient id="hamsterWorry" cx="0.35" cy="0.25" r="1.1">
          <stop offset="0" stopColor="#FED7AA" />
          <stop offset="1" stopColor="#FB923C" />
        </radialGradient>
      </defs>
    </svg>
  );
}
