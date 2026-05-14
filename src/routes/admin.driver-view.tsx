import { createFileRoute } from "@tanstack/react-router";
import { DriverToday } from "./driver.today";

export const Route = createFileRoute("/admin/driver-view")({
  component: DriverToday,
});
