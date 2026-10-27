"use client";

import { Button } from "@saas/ui";
import { useLogoutMutation } from "../api";

export type LogoutButtonProps = {
  className?: string;
  label?: string;
};

/** Feature-owned logout control. */
export function LogoutButton({ className, label = "Sign out" }: LogoutButtonProps) {
  const logoutMutation = useLogoutMutation();

  return (
    <Button
      variant="ghost"
      className={className}
      loading={logoutMutation.isPending}
      onClick={() => logoutMutation.mutate()}
    >
      {label}
    </Button>
  );
}
