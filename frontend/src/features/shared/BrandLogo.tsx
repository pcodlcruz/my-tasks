import logoUrl from '../../assets/brand/logo.png'

// The badge is shown whole, never cropped (it is the owner's artwork): it only reads well when
// large, so there is a single size. The intrinsic size reserves the box before the image loads
// (no layout shift) and keeps the aspect ratio when CSS narrows it on small screens.
const WIDTH = 176
const HEIGHT = 189

// Decorative: the name next to it is the text that screen readers announce.
export function BrandLogo(): JSX.Element {
  return (
    <img
      data-testid="brand-logo"
      src={logoUrl}
      alt=""
      width={WIDTH}
      height={HEIGHT}
      className="h-auto w-32 sm:w-44"
    />
  )
}
