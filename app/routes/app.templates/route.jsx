import { useLoaderData, useFetcher, Outlet, useLocation } from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";
import { useEffect, useState } from "react";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../../shopify.server";
import { getTemplates, deleteTemplate, getProducts, getCollections, saveTemplateAssignment, getAllAssignments } from "../../models/template.server.js";

export const loader = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  const templates = await getTemplates(session.shop);
  const products = await getProducts(session.shop);
  const collections = await getCollections(session.shop);
  const allAssignments = await getAllAssignments(session.shop);

  // Creează map-uri pentru a verifica rapid ce este deja assignat
  const assignedCollections = new Set();
  const assignedProducts = new Set();
  let hasGlobalAssignment = false;
  let globalAssignmentTemplateId = null;

  allAssignments.forEach(assignment => {
    if (assignment.assignmentType === "DEFAULT") {
      hasGlobalAssignment = true;
      globalAssignmentTemplateId = assignment.templateId;
    } else {
      assignment.targets.forEach(target => {
        if (target.targetType === "COLLECTION") {
          assignedCollections.add(target.targetShopifyId);
        } else if (target.targetType === "PRODUCT") {
          assignedProducts.add(target.targetShopifyId);
        }
      });
    }
  });

  return { 
    templates, 
    products, 
    collections, 
    assignedCollections: Array.from(assignedCollections),
    assignedProducts: Array.from(assignedProducts),
    hasGlobalAssignment,
    globalAssignmentTemplateId,
  };
};

export const action = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  const formData = await request.formData();
  const actionType = formData.get("action");
  const templateId = formData.get("templateId");

  if (actionType === "delete" && templateId) {
    try {
      await deleteTemplate(templateId, session.shop);
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  if (actionType === "assign" && templateId) {
    try {
      const assignmentType = formData.get("assignmentType");
      const targetIds = formData.getAll("targetIds");
      const isExcluded = formData.get("isExcluded") === "true";
      await saveTemplateAssignment(templateId, assignmentType, targetIds, session.shop, isExcluded);
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  if (actionType === "search") {
    const searchType = formData.get("searchType");
    const search = formData.get("search") || "";
    if (searchType === "products") {
      const products = await getProducts(session.shop, search);
      return { success: true, results: products };
    } else if (searchType === "collections") {
      const collections = await getCollections(session.shop, search);
      return { success: true, results: collections };
    }
  }

  return { success: false, error: "Invalid action" };
};

function TemplateAssignment({ template, products: initialProducts, collections: initialCollections, shopify, assignedCollections, assignedProducts, hasGlobalAssignment, globalAssignmentTemplateId }) {
  const fetcher = useFetcher();
  const assignment = template.assignments?.[0];
  // Determină tipul de assignment și dacă este except
  const getAssignmentTypeFromAssignment = () => {
    if (!assignment) return "NONE";
    if (assignment.assignmentType === "DEFAULT") return "GLOBAL";
    // Verifică dacă toate target-urile sunt excluded
    const allExcluded = assignment.targets?.every(t => t.isExcluded) || false;
    if (allExcluded && assignment.targets?.length > 0) {
      return assignment.assignmentType === "PRODUCT" ? "PRODUCT_EXCEPT" : "COLLECTION_EXCEPT";
    }
    return assignment.assignmentType;
  };

  const [assignmentType, setAssignmentType] = useState(getAssignmentTypeFromAssignment());
  const [selectedProducts, setSelectedProducts] = useState(
    assignment?.targets?.filter(t => t.targetType === "PRODUCT" && !t.isExcluded).map(t => t.targetShopifyId) || []
  );
  const [selectedCollections, setSelectedCollections] = useState(
    assignment?.targets?.filter(t => t.targetType === "COLLECTION" && !t.isExcluded).map(t => t.targetShopifyId) || []
  );
  const [excludedProducts, setExcludedProducts] = useState(
    assignment?.targets?.filter(t => t.targetType === "PRODUCT" && t.isExcluded).map(t => t.targetShopifyId) || []
  );
  const [excludedCollections, setExcludedCollections] = useState(
    assignment?.targets?.filter(t => t.targetType === "COLLECTION" && t.isExcluded).map(t => t.targetShopifyId) || []
  );
  const [productSearch, setProductSearch] = useState("");
  const [collectionSearch, setCollectionSearch] = useState("");
  const [products, setProducts] = useState(initialProducts);
  const [collections, setCollections] = useState(initialCollections);
  const [isExpanded, setIsExpanded] = useState(false);
  const [showSuccessBanner, setShowSuccessBanner] = useState(false);
  const [showErrorBanner, setShowErrorBanner] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  // Funcție pentru a obține textul de assignment info
  const getAssignmentInfo = () => {
    if (!assignment) {
      return "Not assigned";
    }
    
    if (assignment.assignmentType === "DEFAULT") {
      return "Assigned globally";
    }
    
    const productCount = assignment.targets?.filter(t => t.targetType === "PRODUCT" && !t.isExcluded).length || 0;
    const excludedProductCount = assignment.targets?.filter(t => t.targetType === "PRODUCT" && t.isExcluded).length || 0;
    const collectionCount = assignment.targets?.filter(t => t.targetType === "COLLECTION" && !t.isExcluded).length || 0;
    const excludedCollectionCount = assignment.targets?.filter(t => t.targetType === "COLLECTION" && t.isExcluded).length || 0;
    
    if (assignment.assignmentType === "PRODUCT") {
      if (excludedProductCount > 0) {
        return `Assigned to all products, except ${excludedProductCount} ${excludedProductCount === 1 ? "product" : "products"}`;
      }
      if (productCount > 0) {
        return `Assigned on ${productCount} ${productCount === 1 ? "product" : "products"}`;
      }
    }
    
    if (assignment.assignmentType === "COLLECTION") {
      if (excludedCollectionCount > 0) {
        return `Assigned to all collections, except ${excludedCollectionCount} ${excludedCollectionCount === 1 ? "collection" : "collections"}`;
      }
      if (collectionCount > 0) {
        return `Assigned on ${collectionCount} ${collectionCount === 1 ? "collection" : "collections"}`;
      }
    }
    
    return "Not assigned";
  };

  const handleAssignmentTypeChange = (type) => {
    // Verifică dacă există deja un template assignat global
    if (type === "GLOBAL" && hasGlobalAssignment && globalAssignmentTemplateId !== template.id) {
      setShowErrorBanner(true);
      setShowSuccessBanner(false);
      setErrorMessage("Another template is already assigned globally. Please unassign it first.");
      return;
    }
    setAssignmentType(type);
    if (type === "GLOBAL") {
      setSelectedProducts([]);
      setSelectedCollections([]);
      setExcludedProducts([]);
      setExcludedCollections([]);
    } else if (type === "PRODUCT_EXCEPT") {
      setSelectedProducts([]);
      setSelectedCollections([]);
      setExcludedCollections([]);
    } else if (type === "COLLECTION_EXCEPT") {
      setSelectedProducts([]);
      setSelectedCollections([]);
      setExcludedProducts([]);
    } else if (type === "PRODUCT") {
      setExcludedProducts([]);
      setExcludedCollections([]);
      setSelectedCollections([]);
    } else if (type === "COLLECTION") {
      setExcludedProducts([]);
      setExcludedCollections([]);
      setSelectedProducts([]);
    }
  };

  const handleSave = () => {
    let targetIds = [];
    let isExcluded = false;
    let actualAssignmentType = assignmentType;
    
    if (assignmentType === "PRODUCT") {
      targetIds = selectedProducts;
      actualAssignmentType = "PRODUCT";
    } else if (assignmentType === "COLLECTION") {
      targetIds = selectedCollections;
      actualAssignmentType = "COLLECTION";
    } else if (assignmentType === "PRODUCT_EXCEPT") {
      // Pentru EXCEPT, salvăm doar excluderile
      targetIds = excludedProducts;
      isExcluded = true;
      actualAssignmentType = "PRODUCT";
    } else if (assignmentType === "COLLECTION_EXCEPT") {
      // Pentru EXCEPT, salvăm doar excluderile
      targetIds = excludedCollections;
      isExcluded = true;
      actualAssignmentType = "COLLECTION";
    } else if (assignmentType === "GLOBAL") {
      actualAssignmentType = "DEFAULT";
    }

    const formData = new FormData();
    formData.append("action", "assign");
    formData.append("templateId", template.id);
    formData.append("assignmentType", actualAssignmentType);
    formData.append("isExcluded", isExcluded ? "true" : "false");
    targetIds.forEach(id => {
      formData.append("targetIds", id);
    });

    fetcher.submit(formData, { method: "POST" });
  };

  const handleProductSearch = (search) => {
    setProductSearch(search);
    if (search.length > 0) {
      fetcher.submit(
        { action: "search", searchType: "products", search },
        { method: "POST" }
      );
    } else {
      setProducts(initialProducts);
    }
  };

  const handleCollectionSearch = (search) => {
    setCollectionSearch(search);
    if (search.length > 0) {
      fetcher.submit(
        { action: "search", searchType: "collections", search },
        { method: "POST" }
      );
    } else {
      setCollections(initialCollections);
    }
  };

  useEffect(() => {
    if (fetcher.data?.success && fetcher.data?.results) {
      if (fetcher.formData?.get("searchType") === "products") {
        setProducts(fetcher.data.results);
      } else if (fetcher.formData?.get("searchType") === "collections") {
        setCollections(fetcher.data.results);
      }
    }
  }, [fetcher.data]);

  // Banner notification pentru save assignment
  useEffect(() => {
    if (fetcher.state === "idle" && fetcher.data) {
      // Verifică dacă este un răspuns de la action-ul de assign
      // (nu are results, deci nu este search)
      if (fetcher.data.success !== undefined && !fetcher.data.results) {
        if (fetcher.data.success) {
          setShowSuccessBanner(true);
          setShowErrorBanner(false);
          // Reîncarcă pagina pentru a actualiza informațiile
          setTimeout(() => {
            window.location.reload();
          }, 2000);
        } else {
          setShowErrorBanner(true);
          setShowSuccessBanner(false);
          setErrorMessage(fetcher.data.error || "An error occurred");
        }
      }
    }
  }, [fetcher.state, fetcher.data]);

  return (
    <s-box padding="base" borderWidth="base" borderRadius="base" background="base">
      <s-stack direction="block" gap="base">
        {/* Banner de succes */}
        {showSuccessBanner && (
          <s-banner heading="Assignment saved" tone="success" dismissible={true} onDismiss={() => setShowSuccessBanner(false)}>
            Assignment has been saved successfully.
          </s-banner>
        )}

        {/* Banner de eroare */}
        {showErrorBanner && (
          <s-banner heading="Error" tone="critical" dismissible={true} onDismiss={() => setShowErrorBanner(false)}>
            {errorMessage}
          </s-banner>
        )}

        <s-stack direction="inline" gap="base" alignment="space-between">
          <div>
            <s-text tone="subdued">{getAssignmentInfo()}</s-text>
          </div>
          <s-button
            type="button"
            variant="primary"
            onClick={() => setIsExpanded(!isExpanded)}
          >
            {isExpanded ? "Hide" : "Show"}
          </s-button>
        </s-stack>

        {isExpanded && (
          <s-stack direction="block" gap="base">
            <s-stack direction="block" gap="tight">
              <s-checkbox
                checked={assignmentType === "GLOBAL"}
                disabled={hasGlobalAssignment && globalAssignmentTemplateId !== template.id}
                onChange={() => handleAssignmentTypeChange("GLOBAL")}
                label={hasGlobalAssignment && globalAssignmentTemplateId !== template.id 
                  ? "Assign this template globally (another template is already assigned globally)" 
                  : "Assign this template globally"}
              />
              <s-checkbox
                checked={assignmentType === "COLLECTION"}
                onChange={() => handleAssignmentTypeChange("COLLECTION")}
                label="Assign to collections"
              />
              <s-checkbox
                checked={assignmentType === "COLLECTION_EXCEPT"}
                onChange={() => handleAssignmentTypeChange("COLLECTION_EXCEPT")}
                label="Assign to collections, except:"
              />
              <s-checkbox
                checked={assignmentType === "PRODUCT"}
                onChange={() => handleAssignmentTypeChange("PRODUCT")}
                label="Assign to products"
              />
              <s-checkbox
                checked={assignmentType === "PRODUCT_EXCEPT"}
                onChange={() => handleAssignmentTypeChange("PRODUCT_EXCEPT")}
                label="Assign to products, except:"
              />
            </s-stack>

            {assignmentType === "COLLECTION" && (
              <s-stack direction="block" gap="base">
                <s-text-field
                  label="Caută colecții"
                  value={collectionSearch}
                  onChange={(e) => handleCollectionSearch(e.target.value)}
                  placeholder="Caută după nume..."
                />
                <div style={{ maxHeight: "300px", overflowY: "auto", border: "1px solid #e1e3e5", borderRadius: "4px", padding: "8px" }}>
                  {collections.map((collection) => {
                    const isAssigned = assignedCollections.includes(collection.shopifyId) && !selectedCollections.includes(collection.shopifyId);
                    const isCurrentTemplate = selectedCollections.includes(collection.shopifyId);
                    return (
                      <s-checkbox
                        key={collection.id}
                        checked={isCurrentTemplate}
                        disabled={isAssigned}
                        onChange={(e) => {
                          if (e.target.checked && !isAssigned) {
                            setSelectedCollections([...selectedCollections, collection.shopifyId]);
                          } else if (!isAssigned) {
                            setSelectedCollections(selectedCollections.filter(id => id !== collection.shopifyId));
                          }
                        }}
                        label={isAssigned ? `${collection.title} (already assigned to a template)` : collection.title}
                      />
                    );
                  })}
                </div>
              </s-stack>
            )}

            {assignmentType === "PRODUCT" && (
              <s-stack direction="block" gap="base">
                <s-text-field
                  label="Caută produse"
                  value={productSearch}
                  onChange={(e) => handleProductSearch(e.target.value)}
                  placeholder="Caută după nume..."
                />
                <div style={{ maxHeight: "300px", overflowY: "auto", border: "1px solid #e1e3e5", borderRadius: "4px", padding: "8px" }}>
                  {products.map((product) => {
                    const isAssigned = assignedProducts.includes(product.shopifyId) && !selectedProducts.includes(product.shopifyId);
                    const isCurrentTemplate = selectedProducts.includes(product.shopifyId);
                    return (
                      <s-checkbox
                        key={product.id}
                        checked={isCurrentTemplate}
                        disabled={isAssigned}
                        onChange={(e) => {
                          if (e.target.checked && !isAssigned) {
                            setSelectedProducts([...selectedProducts, product.shopifyId]);
                          } else if (!isAssigned) {
                            setSelectedProducts(selectedProducts.filter(id => id !== product.shopifyId));
                          }
                        }}
                        label={isAssigned ? `${product.title} (already assigned to a template)` : product.title}
                      />
                    );
                  })}
                </div>
              </s-stack>
            )}

            {assignmentType === "PRODUCT_EXCEPT" && (
              <s-stack direction="block" gap="base">
                <s-text-field
                  label="Caută produse de exclus"
                  value={productSearch}
                  onChange={(e) => handleProductSearch(e.target.value)}
                  placeholder="Caută după nume..."
                />
                <div style={{ maxHeight: "300px", overflowY: "auto", border: "1px solid #e1e3e5", borderRadius: "4px", padding: "8px" }}>
                  {products.map((product) => {
                    const isExcluded = excludedProducts.includes(product.shopifyId);
                    return (
                      <s-checkbox
                        key={product.id}
                        checked={isExcluded}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setExcludedProducts([...excludedProducts, product.shopifyId]);
                          } else {
                            setExcludedProducts(excludedProducts.filter(id => id !== product.shopifyId));
                          }
                        }}
                        label={product.title}
                      />
                    );
                  })}
                </div>
              </s-stack>
            )}

            {assignmentType === "COLLECTION_EXCEPT" && (
              <s-stack direction="block" gap="base">
                <s-text-field
                  label="Caută colecții de exclus"
                  value={collectionSearch}
                  onChange={(e) => handleCollectionSearch(e.target.value)}
                  placeholder="Caută după nume..."
                />
                <div style={{ maxHeight: "300px", overflowY: "auto", border: "1px solid #e1e3e5", borderRadius: "4px", padding: "8px" }}>
                  {collections.map((collection) => {
                    const isExcluded = excludedCollections.includes(collection.shopifyId);
                    return (
                      <s-checkbox
                        key={collection.id}
                        checked={isExcluded}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setExcludedCollections([...excludedCollections, collection.shopifyId]);
                          } else {
                            setExcludedCollections(excludedCollections.filter(id => id !== collection.shopifyId));
                          }
                        }}
                        label={collection.title}
                      />
                    );
                  })}
                </div>
              </s-stack>
            )}

            <s-button type="button" variant="primary" onClick={handleSave}>
              Salvează Assignment
            </s-button>
          </s-stack>
        )}
      </s-stack>
    </s-box>
  );
}

export default function TemplatesPage() {
  const { templates, products, collections, assignedCollections, assignedProducts, hasGlobalAssignment, globalAssignmentTemplateId } = useLoaderData();
  const fetcher = useFetcher();
  const shopify = useAppBridge();
  const location = useLocation();

  useEffect(() => {
    if (fetcher.data?.success === false) {
      shopify.toast.show(`Eroare: ${fetcher.data.error}`, { isError: true });
    } else if (fetcher.data?.success) {
      shopify.toast.show("Template șters cu succes!");
      window.location.reload();
    }
  }, [fetcher.data, shopify]);

  const handleDelete = (templateId) => {
    if (confirm("Ești sigur că vrei să ștergi acest template?")) {
      fetcher.submit(
        { templateId, action: "delete" },
        { method: "POST" }
      );
    }
  };

  const isOnDetailPage = location.pathname.includes("/templates/") && location.pathname !== "/app/templates";

  // Dacă suntem pe o pagină de detalii (new sau edit), afișăm doar Outlet
  if (isOnDetailPage) {
    return <Outlet />;
  }

  return (
    <s-page heading="Template-uri de Specificații">
        <s-button slot="primary-action" href="/app/templates/new">
          Create new template
        </s-button>

        {templates.length === 0 ? (
          <s-section heading="Niciun template creat">
            <s-paragraph>
              You haven't created any templates yet. Click the "Create new template" button to get started.
            </s-paragraph>
          </s-section>
        ) : (
          <s-section heading="Custom templates">
            <s-stack direction="block" gap="base">
              {templates.map((template) => (
                <s-box
                  key={template.id}
                  padding="base"
                  borderWidth="base"
                  borderRadius="base"
                  background="subdued"
                >
                  <s-stack direction="block" gap="tight">
                    <s-stack direction="inline" gap="base" alignment="space-between">
                      <div>
                        <s-heading level="3">{template.name}</s-heading>
                        <s-text>
                          {template.sections.length} sections,{" "}
                          {template.sections.reduce(
                            (acc, section) => acc + section.metafields.length,
                            0
                          )}{" "}
                          metafields
                        </s-text>
                      </div>
                      <s-stack direction="inline" gap="tight">
                        <s-badge
                          status={template.isActive ? "success" : "attention"}
                        >
                          {template.isActive ? "Activ" : "Inactiv"}
                        </s-badge>
                        {template.isAccordion && (
                          <s-badge>Accordion</s-badge>
                        )}
                      </s-stack>
                    </s-stack>
                    <s-stack direction="inline" gap="tight">
                      <s-button
                        href={`/app/templates/${template.id}`}
                        variant="primary"
                      >
                        Edit
                      </s-button>
                      <s-button
                        onClick={() => handleDelete(template.id)}
                        variant="critical"
                      >
                        Delete
                      </s-button>
                    </s-stack>
                    <TemplateAssignment
                      template={template}
                      products={products}
                      collections={collections}
                      shopify={shopify}
                      assignedCollections={assignedCollections}
                      assignedProducts={assignedProducts}
                      hasGlobalAssignment={hasGlobalAssignment}
                      globalAssignmentTemplateId={globalAssignmentTemplateId}
                    />
                  </s-stack>
                </s-box>
              ))}
            </s-stack>
          </s-section>
        )}
    </s-page>
  );
}

export const headers = (headersArgs) => {
  return boundary.headers(headersArgs);
};

