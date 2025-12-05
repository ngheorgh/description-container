import { useEffect, useState } from "react";
import { useFetcher, useLoaderData } from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../../shopify.server";
import { syncAll, setShopAppUrl, getShopAppUrl } from "../../models/sync.server";
import prisma from "../../db.server";

export const loader = async ({ request }) => {
  const { admin, session } = await authenticate.admin(request);

  // Verifică dacă există date sincronizate pentru acest shop
  const shop = await prisma.shop.findUnique({
    where: { shopDomain: session.shop },
    include: {
      _count: {
        select: {
          products: true,
          collections: true,
          metafieldDefinitions: true,
        },
      },
    },
  });

  // Obține URL-ul app-ului din metafield
  let appUrl = null;
  try {
    appUrl = await getShopAppUrl(admin);
  } catch (error) {
    console.error("Error getting app URL:", error);
  }

  // Dacă nu există în metafield, folosește URL-ul din variabila de mediu (generat automat de CLI)
  // Acesta este URL-ul din shopify.app.toml (application_url)
  const currentAppUrl = process.env.SHOPIFY_APP_URL || null;

  // Dacă nu există appUrl în metafield, folosește automat URL-ul din shopify.app.toml
  const finalAppUrl = appUrl || currentAppUrl;

  return {
    isSynced: !!shop,
    counts: shop && shop._count
      ? {
          products: shop._count.products || 0,
          collections: shop._count.collections || 0,
          metafieldDefinitions: shop._count.metafieldDefinitions || 0,
        }
      : null,
    appUrl: finalAppUrl, // Folosește metafield-ul sau URL-ul din shopify.app.toml
    suggestedAppUrl: currentAppUrl, // URL-ul din shopify.app.toml (pentru a-l afișa ca sugestie)
  };
};

export const action = async ({ request }) => {
  const { admin, session } = await authenticate.admin(request);
  const formData = await request.formData();
  const actionType = formData.get("actionType");

  // Dacă este acțiunea de setare a URL-ului app-ului
  if (actionType === "setAppUrl") {
    const appUrl = formData.get("appUrl");
    
    if (!appUrl || typeof appUrl !== "string" || appUrl.trim() === "") {
      return {
        success: false,
        error: "URL-ul aplicației este obligatoriu",
      };
    }

    try {
      await setShopAppUrl(admin, session.shop, appUrl.trim());
      return {
        success: true,
        message: "URL-ul aplicației a fost setat cu succes",
        appUrl: appUrl.trim(),
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
      };
    }
  }

  // Acțiunea de sincronizare
  try {
    const results = await syncAll(admin, session.shop);

    return {
      success: true,
      results: {
        products: results.products
          ? {
              totalSynced: results.products.totalSynced,
            }
          : null,
        collections: results.collections
          ? {
              totalSynced: results.collections.totalSynced,
            }
          : null,
        metafieldDefinitions: results.metafieldDefinitions
          ? {
              totalSynced: results.metafieldDefinitions.totalSynced,
            }
          : null,
        errors: results.errors,
      },
    };
  } catch (error) {
    return {
      success: false,
      error: error.message,
    };
  }
};

export default function SyncPage() {
  const loaderData = useLoaderData();
  const { isSynced, counts, appUrl, suggestedAppUrl } = loaderData || {};
  const fetcher = useFetcher();
  const shopify = useAppBridge();
  // Folosește automat URL-ul din shopify.app.toml dacă nu există unul setat manual
  const [appUrlValue, setAppUrlValue] = useState(appUrl || suggestedAppUrl || "");
  const isLoading =
    ["loading", "submitting"].includes(fetcher.state) &&
    fetcher.formMethod === "POST";

  useEffect(() => {
    if (fetcher.data?.success) {
      if (fetcher.data.message) {
        // Mesaj pentru setarea URL-ului
        shopify.toast.show(fetcher.data.message);
        if (fetcher.data.appUrl) {
          setAppUrlValue(fetcher.data.appUrl);
        }
      } else if (fetcher.data.results) {
        // Mesaj pentru sincronizare
        const results = fetcher.data.results;
        shopify.toast.show(
          `Sincronizare completă! Produse: ${results.products?.totalSynced || 0}, Colecții: ${results.collections?.totalSynced || 0}, Metafield-uri: ${results.metafieldDefinitions?.totalSynced || 0}`
        );
      }
    } else if (fetcher.data?.success === false) {
      shopify.toast.show(`Eroare: ${fetcher.data.error}`, { isError: true });
    }
  }, [fetcher.data, shopify]);

  const handleSync = () => {
    fetcher.submit({ actionType: "sync" }, { method: "POST" });
  };

  const handleSetAppUrl = (e) => {
    e.preventDefault();
    const formData = new FormData();
    formData.append("actionType", "setAppUrl");
    formData.append("appUrl", appUrlValue);
    fetcher.submit(formData, { method: "POST" });
  };

  return (
    <s-page heading="Sincronizare Date">
      <s-section heading="Configurare URL Aplicație">
        <s-paragraph>
          URL-ul aplicației este setat automat din <code>shopify.app.toml</code> (application_url).
          Dacă dorești să folosești un URL diferit, poți să îl setezi manual aici.
        </s-paragraph>
        {suggestedAppUrl && !appUrl && (
          <s-box
            padding="base"
            borderWidth="base"
            borderRadius="base"
            background="info-subdued"
            style={{ marginBottom: "16px" }}
          >
            <s-text emphasis="strong">URL sugerat (din development):</s-text>
            <s-text>{suggestedAppUrl}</s-text>
            <s-button
              variant="plain"
              onClick={() => setAppUrlValue(suggestedAppUrl)}
              style={{ marginTop: "8px" }}
            >
              Folosește acest URL
            </s-button>
          </s-box>
        )}
        <fetcher.Form onSubmit={handleSetAppUrl}>
          <s-stack direction="block" gap="base">
            <s-text-field
              label="URL Aplicație"
              name="appUrl"
              value={appUrlValue}
              onInput={(e) => setAppUrlValue(e.target.value)}
              placeholder="https://your-app-domain.com"
              helpText="URL-ul complet al aplicației (fără /api/template la final). În development, folosește URL-ul generat de Shopify CLI (de obicei un URL ngrok)."
            />
            <s-button
              type="submit"
              {...(isLoading && fetcher.formData?.get("actionType") === "setAppUrl" ? { loading: true } : {})}
            >
              Salvează URL
            </s-button>
          </s-stack>
        </fetcher.Form>
        {appUrl && (
          <s-box
            padding="base"
            borderWidth="base"
            borderRadius="base"
            background="success-subdued"
            style={{ marginTop: "16px" }}
          >
            <s-text emphasis="strong">URL configurat:</s-text>
            <s-text>{appUrl}</s-text>
          </s-box>
        )}
      </s-section>

      <s-section heading="Sincronizare Produse, Colecții și Metafield-uri">
        <s-paragraph>
          Această pagină sincronizează toate produsele, colecțiile și definițiile
          metafield-urilor din magazinul tău în baza de date a aplicației.
        </s-paragraph>
        {isSynced && counts && (
          <s-box
            padding="base"
            borderWidth="base"
            borderRadius="base"
            background="success-subdued"
          >
            <s-text emphasis="strong">Date deja sincronizate:</s-text>
            <s-unordered-list>
              <s-list-item>
                Produse: <s-text emphasis="strong">{counts?.products ?? 0}</s-text>
              </s-list-item>
              <s-list-item>
                Colecții: <s-text emphasis="strong">{counts?.collections ?? 0}</s-text>
              </s-list-item>
              <s-list-item>
                Metafield-uri:{" "}
                <s-text emphasis="strong">{counts?.metafieldDefinitions ?? 0}</s-text>
              </s-list-item>
            </s-unordered-list>
          </s-box>
        )}
        {!isSynced && (
          <s-box
            padding="base"
            borderWidth="base"
            borderRadius="base"
            background="warning-subdued"
          >
            <s-text emphasis="strong">
              Datele nu au fost sincronizate încă. Apasă butonul de mai jos
              pentru a începe sincronizarea.
            </s-text>
          </s-box>
        )}
        <s-paragraph>
          Apasă butonul de mai jos pentru a sincroniza sau re-sincroniza datele.
        </s-paragraph>
        <s-button
          onClick={handleSync}
          {...(isLoading ? { loading: true } : {})}
        >
          {isSynced ? "Re-sincronizează Datele" : "Sincronizează Datele"}
        </s-button>
        {fetcher.data?.success && (
          <s-section heading="Rezultate Sincronizare">
            <s-stack direction="block" gap="base">
              <s-paragraph>
                <s-text>Produse sincronizate: </s-text>
                <s-text emphasis="strong">
                  {fetcher.data.results.products?.totalSynced || 0}
                </s-text>
              </s-paragraph>
              <s-paragraph>
                <s-text>Colecții sincronizate: </s-text>
                <s-text emphasis="strong">
                  {fetcher.data.results.collections?.totalSynced || 0}
                </s-text>
              </s-paragraph>
              <s-paragraph>
                <s-text>Metafield-uri sincronizate: </s-text>
                <s-text emphasis="strong">
                  {fetcher.data.results.metafieldDefinitions?.totalSynced || 0}
                </s-text>
              </s-paragraph>
              {fetcher.data.results.errors?.length > 0 && (
                <s-box
                  padding="base"
                  borderWidth="base"
                  borderRadius="base"
                  background="critical-subdued"
                >
                  <s-text emphasis="strong">Erori:</s-text>
                  <s-unordered-list>
                    {fetcher.data.results.errors.map((err, index) => (
                      <s-list-item key={index}>
                        {err.type}: {err.error}
                      </s-list-item>
                    ))}
                  </s-unordered-list>
                </s-box>
              )}
            </s-stack>
          </s-section>
        )}
      </s-section>
    </s-page>
  );
}

export const headers = (headersArgs) => {
  return boundary.headers(headersArgs);
};

