"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { isApiError } from "@saas/services";
import { useI18n } from "@saas/intl";
import { Alert, Button, Input, Label } from "@saas/ui";
import { loginFormDefaults, loginSchema, type LoginFormValues } from "../validation";
import { useLoginMutation } from "../api";

export type LoginFormProps = {
  className?: string;
};

/**
 * Feature-owned login form. Composition of design-system primitives with
 * validation owned by this feature. No business logic leaks into the form
 * beyond the submit handler.
 */
export function LoginForm({ className }: LoginFormProps) {
  const { t } = useI18n();
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting }
  } = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: loginFormDefaults
  });

  const loginMutation = useLoginMutation();

  const onSubmit = (values: LoginFormValues) => {
    loginMutation.mutate(values);
  };

  const errorMessage = loginMutation.isError
    ? isApiError(loginMutation.error)
      ? loginMutation.error.message
      : t("login.genericError")
    : null;

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className={className}>
      <div className="grid gap-4">
        {errorMessage ? (
          <Alert variant="destructive" title={t("login.failed")}>
            {errorMessage}
          </Alert>
        ) : null}

        <div className="grid gap-2">
          <Label htmlFor="email">{t("login.email")}</Label>
          <Input
            id="email"
            type="email"
            autoComplete="email"
            placeholder={t("login.emailPlaceholder")}
            aria-invalid={errors.email ? true : undefined}
            aria-describedby={errors.email ? "email-error" : undefined}
            {...register("email")}
          />
          {errors.email ? (
            <p id="email-error" className="text-sm text-destructive" role="alert">
              {errors.email.message}
            </p>
          ) : null}
        </div>

        <div className="grid gap-2">
          <Label htmlFor="password">{t("login.password")}</Label>
          <Input
            id="password"
            type="password"
            autoComplete="current-password"
            placeholder={t("login.passwordPlaceholder")}
            aria-invalid={errors.password ? true : undefined}
            aria-describedby={errors.password ? "password-error" : undefined}
            {...register("password")}
          />
          {errors.password ? (
            <p id="password-error" className="text-sm text-destructive" role="alert">
              {errors.password.message}
            </p>
          ) : null}
        </div>

        <Button type="submit" className="w-full" loading={isSubmitting || loginMutation.isPending}>
          {t("login.submit")}
        </Button>
      </div>
    </form>
  );
}
