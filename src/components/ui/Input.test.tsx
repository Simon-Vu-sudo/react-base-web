import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Input } from './Input'

describe('<Input>', () => {
  it('associates the label with the control', () => {
    render(<Input label="Email" name="email" />)
    expect(screen.getByLabelText('Email')).toBeInTheDocument()
  })

  it('renders an error and links it via aria-describedby', () => {
    render(<Input label="Email" name="email" error="Required" />)
    const input = screen.getByLabelText('Email')
    expect(screen.getByText('Required')).toBeInTheDocument()
    expect(input).toHaveAttribute('aria-invalid', 'true')
    const describedBy = input.getAttribute('aria-describedby')
    expect(describedBy).toBeTruthy()
    expect(document.getElementById(describedBy!)).toHaveTextContent('Required')
  })

  it('is not marked invalid without an error', () => {
    render(<Input label="Email" name="email" />)
    expect(screen.getByLabelText('Email')).not.toHaveAttribute('aria-invalid', 'true')
  })
})
