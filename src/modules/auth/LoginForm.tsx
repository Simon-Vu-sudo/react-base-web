import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { HttpError } from '@/lib/http/client'
import { login } from '@/lib/auth/service'
import { Button } from '@/modules/global/components/Button'
import { Input } from '@/modules/global/components/Input'
import { Alert } from '@/modules/global/components/Alert'

const schema = z.object({
  email: z.string().min(1, 'Email is required').email('Enter a valid email address'),
  password: z.string().min(1, 'Password is required'),
})

type Values = z.infer<typeof schema>

/** Deliberately never says which field was wrong — that confirms which accounts exist. */
function messageFor(err: unknown): string {
  if (err instanceof HttpError) {
    if (err.status === 401) return 'That email or password is incorrect.'
    if (err.status === 429) return 'Too many attempts. Please wait and try again.'
    return 'Something went wrong signing you in. Please try again.'
  }
  return 'Could not reach the server. Check your connection and try again.'
}

export function LoginForm({ onSuccess }: { onSuccess: () => void }) {
  const [formError, setFormError] = useState<string | null>(null)
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<Values>({ resolver: zodResolver(schema) })

  const submit = handleSubmit(async (values) => {
    setFormError(null)
    try {
      await login(values)
      onSuccess()
    } catch (err) {
      setFormError(messageFor(err))
    }
  })

  return (
    <form onSubmit={submit} noValidate className="w-80 rounded border border-slate-200 bg-white p-6">
      <h1 className="text-lg font-semibold">Sign in</h1>

      <div className="mt-4 flex flex-col gap-4">
        {formError && <Alert tone="error">{formError}</Alert>}

        <Input
          label="Email"
          type="email"
          autoComplete="email"
          error={errors.email?.message}
          {...register('email')}
        />
        <Input
          label="Password"
          type="password"
          autoComplete="current-password"
          error={errors.password?.message}
          {...register('password')}
        />

        <Button type="submit" loading={isSubmitting}>
          Sign in
        </Button>
      </div>
    </form>
  )
}
