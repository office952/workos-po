import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { getJson, postJson } from "../api/http";
import type { CatalogProductTransport } from "../api/types";
import { Button } from "../components/Button";
import { CatalogContextDialog } from "../components/CatalogContextDialog";
import { PageMetrics } from "../components/PageMetrics";
import { SelectField } from "../components/SelectField";
import "../styles/surfaces/commercial.css";
import { EmptyState } from "../components/EmptyState";
import { FilterBar } from "../components/FilterBar";
import { InlineAlert } from "../components/InlineAlert";
import { CollectionBody } from "../components/LoadingFloor";
import { SurfacePanel } from "../components/SurfacePanel";
import { WorklistRow } from "../components/WorklistRow";
import { resourceKeys } from "../data/resourceKeys";
import { invalidateResources } from "../data/resourceCache";
import { invalidateCustomerProjections } from "../data/invalidation";
import { loadCatalogProducts, loadRequestList } from "../data/routeLoaders";
import { useResource } from "../data/useResource";
import { SlicePage } from "../layout/SlicePage";
import { presentContextMeta } from "../presentation/contextMeta";
import { matchesSearch, uniqueLabels } from "../presentation/listFilter";
import { catalogHref, configuratorHref, parseSpineContext, requestHref } from "../routing/appRoute";
import { navigate } from "../routing/navigate";
import {
  labelsMatchingContext,
  readConfiguratorSession,
  resolveOwnedSpine,
  writeConfiguratorSession,
} from "../session/configuratorSession";

const ALL = "all";
const PAGE_SIZE = 20;
const COLUMNS = ["Produs", "Familie / categorie", "Acțiune"] as const;

export function CatalogPage() {
  const urlContext = parseSpineContext(window.location.search);
  const stored = readConfiguratorSession();
  const catalog = useResource(resourceKeys.catalog(), loadCatalogProducts);
  const hasUrlSpine = Boolean(urlContext.customerId || urlContext.requestId);
  const requests = useResource(
    hasUrlSpine ? resourceKeys.requests() : null,
    loadRequestList,
  );
  const owned = resolveOwnedSpine({
    url: urlContext,
    stored: hasUrlSpine ? stored : { customerId: null, requestId: null },
    requests: requests.status === "success" ? requests.data ?? [] : null,
  });
  const customerId = owned.customerId;
  const requestId = owned.requestId;
  const ownershipVerified = !hasUrlSpine || requests.status === "success";
  const canConfigure = ownershipVerified && Boolean(customerId && requestId);
  const products = useMemo(() => catalog.data ?? [], [catalog.data]);
  const contextRequest =
    (requests.data ?? []).find((item) => item.requestId === requestId) ?? null;
  const [query, setQuery] = useState("");
  const [family, setFamily] = useState(ALL);
  const [category, setCategory] = useState(ALL);
  const [page, setPage] = useState(1);
  const [expandedCode, setExpandedCode] = useState<string | null>(null);
  const [pendingProduct, setPendingProduct] = useState<CatalogProductTransport | null>(null);
  const [contextContinuePending, setContextContinuePending] = useState(false);
  const [offerings, setOfferings] = useState<
    { kind: string; available: boolean; label: string; summary: string }[]
  >([]);

  const [offeringsAttempt, setOfferingsAttempt] = useState(0);
  const [offeringsError, setOfferingsError] = useState(false);
  const contextKey = JSON.stringify([customerId, requestId]);
  const [creation, setCreation] = useState<{
    contextKey: string;
    kind: string | null;
    error: string | null;
  } | null>(null);
  const [creationContext, setCreationContext] = useState(contextKey);
  // Do not revive an abandoned pending action when A → B → A reuses this page.
  if (creationContext !== contextKey) {
    setCreationContext(contextKey);
    setCreation(null);
  }
  const creatingKind = creation?.contextKey === contextKey ? creation.kind : null;
  const createError = creation?.contextKey === contextKey ? creation.error : null;
  const creationScope = useRef(0);
  const contextNavScope = useRef(0);
  useLayoutEffect(() => {
    creationScope.current += 1;
    contextNavScope.current += 1;
    return () => {
      creationScope.current += 1;
      contextNavScope.current += 1;
    };
  }, [customerId, requestId]);

  async function createAssembly(kind: string): Promise<void> {
    if (!canConfigure || !requestId || creatingKind) return;
    const scope = creationScope.current;
    setCreation({ contextKey, kind, error: null });
    try {
      const body = (await postJson("/api/assemblies", { requestId, kind })) as {
        assembly?: { assemblyId?: string };
      };
      if (scope !== creationScope.current) return;
      if (!body.assembly?.assemblyId) throw new Error("missing assembly");
      invalidateCustomerProjections();
      navigate(`/ansamblu?assembly=${encodeURIComponent(body.assembly.assemblyId)}`);
    } catch {
      if (scope === creationScope.current)
        setCreation({
          contextKey,
          kind: null,
          error: "Ansamblul nu a putut fi creat. Reîncearcă.",
        });
    } finally {
      if (scope === creationScope.current)
        setCreation((current) => current && { ...current, kind: null });
    }
  }

  useEffect(() => {
    let cancelled = false;
    void getJson("/api/assemblies/offering")
      .then((body) => {
        if (cancelled) return;
        setOfferingsError(false);
        const record = body as {
          available?: unknown;
          label?: unknown;
          summary?: unknown;
          offerings?: unknown;
        };
        if (Array.isArray(record.offerings)) {
          setOfferings(
            record.offerings.flatMap((item) => {
              if (typeof item !== "object" || item === null) {
                return [];
              }
              const row = item as {
                kind?: unknown;
                available?: unknown;
                label?: unknown;
                summary?: unknown;
              };
              if (
                row.available !== true ||
                typeof row.label !== "string" ||
                typeof row.kind !== "string"
              ) {
                return [];
              }
              return [
                {
                  kind: row.kind,
                  available: true,
                  label: row.label,
                  summary: typeof row.summary === "string" ? row.summary : "",
                },
              ];
            }),
          );
          return;
        }
        if (record.available === true && typeof record.label === "string") {
          setOfferings([
            {
              kind: "SIGN_ASSEMBLY_ACM_LETTERS_V1",
              available: true,
              label: record.label,
              summary: typeof record.summary === "string" ? record.summary : "",
            },
          ]);
        }
      })
      .catch(() => {
        if (cancelled) return;
        setOfferings([]);
        setOfferingsError(true);
      });
    return () => {
      cancelled = true;
    };
  }, [offeringsAttempt]);

  useEffect(() => {
    if (!hasUrlSpine || !ownershipVerified) {
      return;
    }
    const previous = readConfiguratorSession();
    const matched = labelsMatchingContext(previous, { customerId, requestId });
    const customerLabel =
      matched.customerLabel ?? contextRequest?.customerDisplayName ?? null;
    const requestLabel =
      matched.requestLabel ??
      contextRequest?.reference ??
      contextRequest?.title ??
      null;
    writeConfiguratorSession({
      ...previous,
      customerId,
      requestId,
      customerLabel,
      requestLabel,
    });
  }, [
    contextRequest,
    customerId,
    hasUrlSpine,
    ownershipVerified,
    requestId,
  ]);

  const sessionLabels = labelsMatchingContext(stored, { customerId, requestId });
  const labels = {
    customerLabel:
      sessionLabels.customerLabel ?? contextRequest?.customerDisplayName ?? null,
    requestLabel:
      sessionLabels.requestLabel ??
      contextRequest?.reference ??
      contextRequest?.title ??
      null,
  };

  const proposedContext =
    !hasUrlSpine && stored.customerId && stored.requestId
      ? {
          customerId: stored.customerId,
          requestId: stored.requestId,
          customerLabel: stored.customerLabel ?? null,
          requestLabel: stored.requestLabel ?? null,
        }
      : null;

  const families = useMemo(
    () => uniqueLabels(products.map((product) => product.familyLabel)),
    [products],
  );
  const categories = useMemo(
    () =>
      uniqueLabels(
        products
          .filter((product) => family === ALL || product.familyLabel === family)
          .map((product) => product.categoryLabel),
      ),
    [family, products],
  );

  const visible = useMemo(
    () =>
      products.filter((product) => {
        const matchesFamily = family === ALL || product.familyLabel === family;
        const matchesCategory = category === ALL || product.categoryLabel === category;
        return (
          matchesFamily &&
          matchesCategory &&
          matchesSearch(query, [
            product.label,
            product.description,
            product.familyLabel,
            product.categoryLabel,
            product.code,
          ])
        );
      }),
    [category, family, products, query],
  );

  const pageCount = Math.max(1, Math.ceil(visible.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount);
  if (page !== currentPage) {
    setPage(currentPage);
  }
  const offset = (currentPage - 1) * PAGE_SIZE;
  const pageRows = visible.slice(offset, offset + PAGE_SIZE);

  const visibleOfferings = offerings.filter((item) =>
    matchesSearch(query, [item.label, item.summary]),
  );

  function chooseProduct(product: CatalogProductTransport): void {
    if (canConfigure) {
      navigate(
        configuratorHref({
          customerId,
          requestId,
          productCode: product.code,
        }),
      );
      return;
    }
    setPendingProduct(product);
  }

  function applyContextAndContinue(selection: {
    customerId: string;
    requestId: string;
    customerLabel: string | null;
    requestLabel: string | null;
  }): void {
    if (!pendingProduct) {
      return;
    }
    const scope = contextNavScope.current;
    const productCode = pendingProduct.code;
    setContextContinuePending(true);
    const previous = readConfiguratorSession();
    writeConfiguratorSession({
      ...previous,
      customerId: selection.customerId,
      requestId: selection.requestId,
      customerLabel: selection.customerLabel,
      requestLabel: selection.requestLabel,
      productCode,
    });
    if (scope !== contextNavScope.current) {
      setContextContinuePending(false);
      return;
    }
    setPendingProduct(null);
    setContextContinuePending(false);
    navigate(
      configuratorHref({
        customerId: selection.customerId,
        requestId: selection.requestId,
        productCode,
      }),
    );
  }

  const pageNumbers = useMemo(() => {
    const numbers: number[] = [];
    for (let number = 1; number <= pageCount; number += 1) {
      if (
        number === 1 ||
        number === pageCount ||
        Math.abs(number - currentPage) <= 1
      ) {
        numbers.push(number);
      }
    }
    return numbers;
  }, [currentPage, pageCount]);

  return (
    <SlicePage
      contextLabel="Catalog"
      currentHref="/catalog"
      workspace="stack"
      surface="catalog-registry"
      headerVariant="pilot"
      eyebrow="Alegere produs"
      title="Catalog"
      instrument={
        <PageMetrics
          items={[
            {
              label: "Produse disponibile",
              value: catalog.status === "success" || products.length > 0 ? products.length : "—",
            },
          ]}
        />
      }
    >
      {canConfigure && requestId ? (
        <div className="commercial-toolbar">
          <div className="commercial-toolbar__context">
            <a className="text-link" href={requestHref(requestId)}>
              ← Înapoi la cerere
            </a>
            <span>
              {presentContextMeta([labels.customerLabel, labels.requestLabel]) ??
                "Clientul și cererea rămân contextul acestei configurări."}
            </span>
          </div>
        </div>
      ) : null}
      {proposedContext && !canConfigure ? (
        <InlineAlert tone="pending" title="Context reținut din sesiune">
          <span>
            {presentContextMeta([
              proposedContext.customerLabel,
              proposedContext.requestLabel,
            ]) ?? "Un client și o cerere au fost folosite anterior."}
          </span>
          <Button
            variant="secondary"
            onClick={() => {
              navigate(
                catalogHref({
                  customerId: proposedContext.customerId,
                  requestId: proposedContext.requestId,
                  productCode: null,
                }),
              );
            }}
          >
            Folosește acest context
          </Button>
        </InlineAlert>
      ) : null}
      {hasUrlSpine && (requests.status === "idle" || requests.status === "loading") ? (
        <InlineAlert tone="pending" title="Se verifică cererea">
          Configurarea va fi disponibilă după verificarea clientului și a cererii. Catalogul rămâne
          consultabil.
        </InlineAlert>
      ) : null}
      {hasUrlSpine && requests.status === "error" ? (
        <InlineAlert tone="error" title="Cererea nu a putut fi verificată">
          Produsele rămân consultabile. Configurarea așteaptă verificarea relației.
          <Button
            variant="secondary"
            onClick={() => invalidateResources(resourceKeys.requests())}
          >
            Reîncearcă
          </Button>
          <a className="text-link" href="/cereri">
            Înapoi la cereri
          </a>
        </InlineAlert>
      ) : null}
      {hasUrlSpine && ownershipVerified && !canConfigure ? (
        <InlineAlert tone="blocked" title="Context incomplet">
          Clientul și cererea din adresă nu pot fi folosite împreună. Alege din nou contextul la
          selectarea produsului.
        </InlineAlert>
      ) : null}
      {!hasUrlSpine && !proposedContext ? (
        <InlineAlert tone="pending" title="Consultare catalog">
          Poți explora produsele. La alegere vei completa clientul și cererea.
        </InlineAlert>
      ) : null}
      <div className="commercial-toolbar">
        <FilterBar
          searchId="catalog-cauta"
          searchLabel="Caută"
          searchValue={query}
          onSearchChange={(value) => {
            setQuery(value);
            setPage(1);
          }}
          variant="toolbar"
          searchPlaceholder="Caută produsul sau ansamblul"
        />
        <div className="commercial-toolbar__family">
          <SelectField
            id="catalog-family"
            label="Familie de produse"
            value={family}
            options={[
              { value: ALL, label: "Toate" },
              ...families.map((label) => ({ value: label, label })),
            ]}
            onChange={(value) => {
              setFamily(value);
              setCategory(ALL);
              setPage(1);
            }}
          />
        </div>
        {categories.length > 0 ? (
          <div className="commercial-toolbar__family">
            <SelectField
              id="catalog-category"
              label="Categorie"
              value={category}
              options={[
                { value: ALL, label: "Toate" },
                ...categories.map((label) => ({ value: label, label })),
              ]}
              onChange={(value) => {
                setCategory(value);
                setPage(1);
              }}
            />
          </div>
        ) : null}
        {query || family !== ALL || category !== ALL ? (
          <Button
            variant="secondary"
            onClick={() => {
              setQuery("");
              setFamily(ALL);
              setCategory(ALL);
              setPage(1);
            }}
          >
            Resetează filtrele
          </Button>
        ) : null}
      </div>
      {catalog.status === "error" && products.length > 0 ? (
        <InlineAlert tone="error" title="Actualizarea catalogului a eșuat">
          Se afișează ultima colecție citită cu succes.
          <Button
            variant="secondary"
            onClick={() => invalidateResources(resourceKeys.catalog())}
          >
            Reîncearcă actualizarea
          </Button>
        </InlineAlert>
      ) : null}
      <section className="commercial-register" aria-label="Produse">
        <div className="commercial-register__heading">
          <h2>Produse</h2>
          <span>
            {catalog.status === "success" || products.length > 0
              ? `${visible.length} din ${products.length}`
              : "—"}
          </span>
        </div>
        <SurfacePanel
          variant="flush"
          label="Șabloane de produs"
          busy={catalog.status === "loading" && products.length === 0}
        >
          <CollectionBody
            status={catalog.status}
            itemCount={products.length}
            visibleCount={visible.length}
            loadingLabel="Se citește catalogul"
            columns={COLUMNS}
            worklistLabel="Șabloane de produs"
            variant="compact"
            errorTitle="Catalogul nu a putut fi citit"
            errorBody="Produsele nu sunt disponibile."
            empty={<EmptyState title="Catalogul nu are șabloane de prezentat." />}
            filteredEmpty={
              <EmptyState
                title="Niciun produs nu corespunde filtrului."
                action={
                  <Button
                    variant="secondary"
                    onClick={() => {
                      setQuery("");
                      setFamily(ALL);
                      setCategory(ALL);
                      setPage(1);
                    }}
                  >
                    Resetează filtrele
                  </Button>
                }
              />
            }
          >
            {pageRows.map((product) => (
              <div key={product.code} className="catalog-product-block">
                <WorklistRow
                  variant="compact"
                  identity={product.label}
                  identityDetail={product.description || undefined}
                  context={
                    [product.familyLabel, product.categoryLabel].filter(Boolean).join(" · ") ||
                    "Produs"
                  }
                  actionLabel="Alege produsul"
                  onSelect={() => chooseProduct(product)}
                />
                <button
                  type="button"
                  className="quiet-action catalog-product-block__detail"
                  onClick={() =>
                    setExpandedCode((current) =>
                      current === product.code ? null : product.code,
                    )
                  }
                >
                  {expandedCode === product.code ? "Ascunde detaliile" : "Arată detaliile"}
                </button>
                {expandedCode === product.code ? (
                  <dl className="catalog-product-block__facts">
                    <div>
                      <dt>Identitate</dt>
                      <dd>{product.label}</dd>
                    </div>
                    {product.description ? (
                      <div>
                        <dt>Descriere</dt>
                        <dd>{product.description}</dd>
                      </div>
                    ) : null}
                    {product.familyLabel ? (
                      <div>
                        <dt>Familie</dt>
                        <dd>{product.familyLabel}</dd>
                      </div>
                    ) : null}
                    {product.categoryLabel ? (
                      <div>
                        <dt>Categorie</dt>
                        <dd>{product.categoryLabel}</dd>
                      </div>
                    ) : null}
                  </dl>
                ) : null}
              </div>
            ))}
          </CollectionBody>
        </SurfacePanel>
        {catalog.status === "error" && products.length === 0 ? (
          <Button
            variant="secondary"
            onClick={() => invalidateResources(resourceKeys.catalog())}
          >
            Reîncearcă citirea catalogului
          </Button>
        ) : null}
        {visible.length > PAGE_SIZE ? (
          <nav className="requests-pagination" aria-label="Paginare catalog">
            <span className="requests-pagination__range" role="status">
              {offset + 1}–{Math.min(offset + PAGE_SIZE, visible.length)} din {visible.length}{" "}
              produse
            </span>
            <div className="requests-pagination__pages">
              <button
                type="button"
                disabled={currentPage === 1}
                onClick={() => setPage(currentPage - 1)}
              >
                Anterior
              </button>
              {pageNumbers.map((number, index) => (
                <span className="requests-pagination__step" key={number}>
                  {index > 0 && number - pageNumbers[index - 1]! > 1 ? (
                    <span aria-hidden="true">…</span>
                  ) : null}
                  <button
                    type="button"
                    aria-label={`Pagina ${number}`}
                    aria-current={number === currentPage ? "page" : undefined}
                    onClick={() => setPage(number)}
                  >
                    {number}
                  </button>
                </span>
              ))}
              <button
                type="button"
                disabled={currentPage === pageCount}
                onClick={() => setPage(currentPage + 1)}
              >
                Următor
              </button>
            </div>
          </nav>
        ) : null}
      </section>
      {offerings.length > 0 || offeringsError ? (
        <section className="commercial-register" id="ansambluri" aria-label="Ansambluri">
          <div className="commercial-register__heading">
            <h2>Ansambluri</h2>
            <span>
              {offerings.length > 0
                ? `${visibleOfferings.length} din ${offerings.length}`
                : "—"}
            </span>
          </div>
          <p className="commercial-note">
            Construiește un rezultat comun din produse configurate separat.
          </p>
          {createError ? (
            <InlineAlert tone="error" title="Crearea a eșuat">
              {createError}
            </InlineAlert>
          ) : null}
          {offerings.length > 0 && visibleOfferings.length === 0 ? (
            <EmptyState title="Niciun ansamblu nu corespunde căutării." />
          ) : null}
          {visibleOfferings.map((item) => (
            <button
              key={item.kind}
              type="button"
              className="worklist-row worklist-row--compact catalog-assembly"
              disabled={!canConfigure || creatingKind !== null}
              onClick={() => void createAssembly(item.kind)}
            >
              <span className="worklist-row__identity">
                <span className="worklist-row__title">{item.label}</span>
                <span className="worklist-row__detail">{item.summary}</span>
              </span>
              <span className="worklist-row__context">Ansamblu</span>
              <span className="worklist-row__action">
                {creatingKind === item.kind
                  ? "Se creează"
                  : canConfigure
                    ? "Creează ansamblul"
                    : "Necesită context"}
              </span>
            </button>
          ))}
        </section>
      ) : null}
      {offeringsError ? (
        <InlineAlert tone="error" title="Ansamblurile nu au putut fi citite">
          <Button
            variant="secondary"
            onClick={() => setOfferingsAttempt((value) => value + 1)}
          >
            Reîncearcă citirea ansamblurilor
          </Button>
        </InlineAlert>
      ) : null}
      {pendingProduct ? (
        <CatalogContextDialog
          productLabel={pendingProduct.label}
          busy={contextContinuePending}
          onDismiss={() => {
            if (!contextContinuePending) {
              setPendingProduct(null);
            }
          }}
          onConfirm={applyContextAndContinue}
        />
      ) : null}
    </SlicePage>
  );
}
