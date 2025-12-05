import { getTemplateForTarget } from "../models/template.server.js";
import { getMetafieldDefinitions } from "../models/template.server.js";

/**
 * Endpoint API public pentru a obține template-ul pentru un produs sau colecție
 * Accesibil din theme extension prin request HTTP
 */
export async function loader({ request }) {
  const url = new URL(request.url);
  const productId = url.searchParams.get("productId");
  const collectionId = url.searchParams.get("collectionId");
  const shop = url.searchParams.get("shop");

  console.log("API Template - Request received:", {
    url: request.url,
    productId,
    collectionId,
    shop,
    headers: Object.fromEntries(request.headers.entries()),
  });

  if (!shop) {
    return Response.json(
      { error: "Shop parameter is required" },
      { status: 400 }
    );
  }

  try {
    const template = await getTemplateForTarget(shop, productId, collectionId);

    if (!template) {
      return Response.json({ template: null });
    }

    // Parse styling JSON
    const styling = typeof template.styling === "string" 
      ? JSON.parse(template.styling) 
      : template.styling;

    // Formatează secțiunile pentru a fi ușor de folosit în Liquid
    const sections = template.sections.map(section => ({
      heading: section.heading,
      metafields: section.metafields.map(mf => ({
        namespace: mf.metafieldDefinition.namespace,
        key: mf.metafieldDefinition.key,
        ownerType: mf.metafieldDefinition.ownerType,
        name: mf.metafieldDefinition.name || null,
        type: mf.metafieldDefinition.type,
      })),
    }));

    // Obține toate metafield definitions din baza de date pentru a construi codul Liquid
    // Acestea sunt toate metafield-urile cunoscute (nu doar cele din template)
    const allMetafieldDefinitions = await getMetafieldDefinitions(shop);
    
    // Colectează toate metafield-urile unice din template
    const uniqueTemplateMetafields = new Map();
    sections.forEach(section => {
      section.metafields.forEach(mf => {
        const key = `${mf.namespace}.${mf.key}.${mf.ownerType}`;
        if (!uniqueTemplateMetafields.has(key)) {
          uniqueTemplateMetafields.set(key, mf);
        }
      });
    });

    const response = Response.json({
      template: {
        id: template.id,
        name: template.name,
        isAccordion: template.isAccordion,
        styling,
        sections,
      },
      // Returnează și toate metafield definitions pentru a construi codul Liquid dinamic
      allMetafieldDefinitions: allMetafieldDefinitions.map(mf => ({
        namespace: mf.namespace,
        key: mf.key,
        ownerType: mf.ownerType,
        name: mf.name,
        type: mf.type,
      })),
    });

    // Adaugă CORS headers pentru a permite request-uri din theme extension
    response.headers.set("Access-Control-Allow-Origin", "*");
    response.headers.set("Access-Control-Allow-Methods", "GET, OPTIONS");
    response.headers.set("Access-Control-Allow-Headers", "Content-Type");

    return response;
  } catch (error) {
    console.error("Error getting template:", error);
    return Response.json(
      { error: error.message },
      { status: 500 }
    );
  }
}

export async function options() {
  return new Response(null, {
    status: 200,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    },
  });
}

