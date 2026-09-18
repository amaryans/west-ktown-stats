import type { ButtonHTMLAttributes } from 'react'

type Variant = 'primary' | 'secondary' | 'ghost'

const VARIANT_CLASSES: Record<Variant, string> = {
  primary:
    'bg-accent text-white hover:bg-sky-400 disabled:bg-gray-500 disabled:text-gray-300 shadow-lg',
  secondary:
    'bg-white/10 text-white border border-white/30 hover:bg-white/20 disabled:opacity-40 backdrop-blur',
  ghost: 'text-white/70 hover:text-white hover:bg-white/10 disabled:opacity-40',
}

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
}

export default function Button({ variant = 'primary', className = '', ...rest }: ButtonProps) {
  return (
    <button
      type="button"
      className={`cursor-pointer rounded-lg px-5 py-2.5 font-semibold transition-colors disabled:cursor-not-allowed ${VARIANT_CLASSES[variant]} ${className}`}
      {...rest}
    />
  )
}
