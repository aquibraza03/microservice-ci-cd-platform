import Link from "next/link";
import { Button, Card, CardContent, CardDescription, CardHeader, CardTitle } from "@saas/ui";
import { getConfig } from "@saas/lib";
import { t } from "@saas/intl";

export default function NotFound() {
  const config = getConfig();

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <Card className="w-full max-w-md text-center">
        <CardHeader>
          <CardTitle className="text-4xl">{t("notFound.title")}</CardTitle>
          <CardDescription>{t("notFound.description")}</CardDescription>
        </CardHeader>
        <CardContent>
          <Button asChild className="w-full">
            <Link href="/">{config.name}</Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
