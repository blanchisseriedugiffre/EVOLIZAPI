import { createFileRoute, Navigate } from "@tanstack/react-router";

export const Route = createFileRoute("/driver/")({
  component: () => <Navigate to="/driver/today" />,
});
