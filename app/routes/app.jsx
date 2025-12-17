import { Outlet, useLoaderData, useRouteError } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { AppProvider } from "@shopify/shopify-app-react-router/react";
import { authenticate } from "../shopify.server";
import CrispChat from "../components/CrispChat.jsx";
import prisma from "../db.server.js";

export const loader = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  const url = new URL(request.url);
  const shopDomain = session.shop;

  // Gating: dacă nu există plan selectat, redirect la /app/plans (evită loop când ești deja acolo)
  if (!url.pathname.startsWith("/app/plans")) {
    const shop = await prisma.shop.upsert({
      where: { shopDomain },
      update: {},
      create: { shopDomain },
      select: { id: true },
    });

    const planRows = await prisma.$queryRaw`
      SELECT "planKey" FROM "ShopPlan" WHERE "shopId" = ${shop.id} LIMIT 1
    `;
    const hasPlan = Array.isArray(planRows) && planRows.length > 0;

    if (!hasPlan) {
      throw new Response("", { status: 302, headers: { Location: "/app/plans" } });
    }
  }

  // eslint-disable-next-line no-undef
  return { apiKey: process.env.SHOPIFY_API_KEY || "" };
};

export default function App() {
  const { apiKey } = useLoaderData();

  return (
    <AppProvider embedded apiKey={apiKey}>
      <CrispChat />
      <s-app-nav>
        <s-link href="/app">Home</s-link>
        <s-link href="/app/plans">Plans</s-link>
        <s-link href="/app/templates">Templates</s-link>
        <s-link href="/app/sync">Data Sync</s-link>
        <s-link href="/app/additional">Additional page</s-link>
      </s-app-nav>
      <Outlet />
    </AppProvider>
  );
}

// Shopify needs React Router to catch some thrown responses, so that their headers are included in the response.
export function ErrorBoundary() {
  return boundary.error(useRouteError());
}

export const headers = (headersArgs) => {
  return boundary.headers(headersArgs);
};
