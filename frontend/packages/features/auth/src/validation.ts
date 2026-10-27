import { z } from "zod";
import { t } from "@saas/intl";

/**
 * Login form validation (client + server share this schema's shape).
 * Messages resolve from the locale dictionary at schema definition time, so no
 * user-facing string is hardcoded in code. Runtime re-localization on a live
 * locale switch (rebuild the schema) is a documented future enhancement.
 */
export const loginSchema = z.object({
  email: z.string().min(1, t("login.emailRequired")).email(t("login.emailInvalid")),
  password: z.string().min(8, t("login.passwordMin"))
});

export type LoginFormValues = z.infer<typeof loginSchema>;

export const loginFormDefaults: LoginFormValues = {
  email: "",
  password: ""
};
