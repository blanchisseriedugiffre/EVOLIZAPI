import { createFileRoute, Link } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Blanchisserie du Giffre — Gestion de commandes de linge" },
      { name: "description", content: "Gérez vos commandes de linge en ligne avec la Blanchisserie du Giffre." },
      { property: "og:title", content: "Blanchisserie du Giffre" },
      { property: "og:description", content: "Gérez vos commandes de linge en ligne." },
    ],
  }),
  component: Landing,
});

function Landing() {
  return (
    <div
      className="relative min-h-screen w-full bg-cover bg-center bg-no-repeat"
      style={{ backgroundImage: "url('/camion.jpg')" }}
    >
      <div className="absolute inset-0 bg-black/60" />
      <main className="relative z-10 flex min-h-screen flex-col items-center justify-center px-6 text-center">
        <h1 className="text-white font-semibold tracking-tight text-4xl sm:text-5xl md:text-6xl lg:text-7xl drop-shadow-lg">
          Blanchisserie du Giffre
        </h1>
        <p className="mt-5 max-w-xl text-white/85 text-base sm:text-lg md:text-xl">
          Gérez vos commandes de linge en ligne
        </p>
        <Link
          to="/login"
          className="mt-10 inline-flex items-center justify-center rounded-full bg-white px-8 py-3.5 text-sm sm:text-base font-medium text-zinc-900 shadow-lg transition-all hover:bg-white/90 hover:scale-[1.02] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-black/40"
        >
          Accéder à mes commandes
        </Link>
      </main>
    </div>
  );
}
