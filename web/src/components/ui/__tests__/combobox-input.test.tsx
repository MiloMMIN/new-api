/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program. If not, see <https://www.gnu.org/licenses/>.
*/
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'

import { Dialog } from '@/components/dialog'

import { ComboboxInput } from '../combobox-input'

const options = [
  { value: 'gpt-5-2-high', label: 'gpt-5-2-high' },
  { value: 'claude-4-5-opus', label: 'claude-4-5-opus' },
]

function DialogComboboxInput(props: {
  onValueChange: (value: string) => void
}) {
  const [value, setValue] = useState('')
  return (
    <Dialog open onOpenChange={() => {}} title='Pick a model'>
      <ComboboxInput
        options={options}
        value={value}
        onValueChange={(v) => {
          setValue(v)
          props.onValueChange(v)
        }}
        aria-label='Model'
      />
    </Dialog>
  )
}

describe('ComboboxInput inside a dialog', () => {
  it('lists options inside the dialog container and selects on click', async () => {
    const onValueChange = vi.fn()
    render(<DialogComboboxInput onValueChange={onValueChange} />)

    const input = screen.getByRole('combobox', { name: 'Model' })
    await userEvent.click(input)

    const option = await screen.findByRole('option', {
      name: 'claude-4-5-opus',
    })
    // The listbox is portaled into the dialog so modal outside-press handling
    // does not swallow option clicks.
    const dialog = screen.getByRole('dialog')
    expect(dialog.contains(option)).toBe(true)
    // Absolutely positioned relative to the (possibly transformed) container,
    // never fixed in viewport space.
    const dropdown = option.closest('div')
    expect(dropdown).not.toBeNull()
    expect(dropdown!.style.position).toBe('absolute')

    await userEvent.click(option)
    expect(onValueChange).toHaveBeenCalledWith('claude-4-5-opus')
    await waitFor(() => expect(input).toHaveValue('claude-4-5-opus'))
  })

  it('renders nothing when there are no options to show', async () => {
    render(
      <Dialog open onOpenChange={() => {}} title='Empty'>
        <ComboboxInput options={[]} onValueChange={() => {}} aria-label='M' />
      </Dialog>
    )
    const input = screen.getByRole('combobox', { name: 'M' })
    await userEvent.click(input)
    expect(screen.queryByRole('option')).toBeNull()
  })
})
