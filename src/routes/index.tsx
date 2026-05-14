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
      <main className="relative z-10 mx-auto flex min-h-screen max-w-7xl flex-col items-stretch gap-10 px-6 py-12 md:flex-row md:items-center md:gap-12 md:py-16">
        {/* Partie gauche : photo en haut, titre en bas */}
        <div className="flex w-full flex-col gap-6 md:w-1/2">
          <img
            src="/camion-livraison.jpg"
            alt="Camion de livraison Blanchisserie du Giffre"
            className="w-full rounded-2xl shadow-2xl object-cover"
          />
          <img
            src="/titre-bleu.jpg"
            alt="Blanchisserie du Giffre"
            className="w-full rounded-2xl bg-white shadow-2xl object-contain"
          />
        </div>

        {/* Partie droite : accroche + bouton */}
        <div className="flex w-full flex-col items-center text-center md:w-1/2 md:items-start md:text-left">
          <p className="max-w-xl text-white text-xl sm:text-2xl md:text-3xl font-light drop-shadow-lg">
            Gérez vos commandes de linge en ligne
          </p>
          <Link
            to="/login"
            className="mt-8 inline-flex items-center justify-center rounded-full bg-white px-8 py-3.5 text-sm sm:text-base font-medium text-zinc-900 shadow-lg transition-all hover:bg-white/90 hover:scale-[1.02] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-black/40"
          >
            Accéder à mes commandes
          </Link>
        </div>
      </main>
    </div>
  );
}
