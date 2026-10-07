import { useEffect, useRef, useState } from "react";
import { presentCustomer, presentCustomerList } from "../adapters/customerAdapter";
import { presentCreatedRequestId } from "../adapters/requestAdapter";
import { asRecord, asString } from "../adapters/record";
import { createCustomer, lookupCustomerByCui } from "../api/customers";
import { createRequest } from "../api/requests";
import { TransportError, readTransportErrorCode } from "../api/http";
import { Button } from "../components/Button";
import { InlineAlert } from "../components/InlineAlert";
import { ProductPicker } from "../components/ProductPicker";
import { invalidateAfterCreateCustomer, invalidateAfterCreateRequest } from "../data/invalidation";
import { invalidateResources } from "../data/resourceCache";
import { resourceKeys } from "../data/resourceKeys";
import { loadCatalogProducts, loadCustomerList, loadCustomerWorkspace } from "../data/routeLoaders";
import { useResource } from "../data/useResource";
import { SlicePage } from "../layout/SlicePage";
import { configuratorHref, requestHref } from "../routing/appRoute";
import { navigate } from "../routing/navigate";
import { readConfiguratorSession, writeConfiguratorSession } from "../session/configuratorSession";
import "../styles/surfaces/request-intake.css";

export function NewRequestPage() {
  const customers = useResource(resourceKeys.customerIntake(), loadCustomerList);
  const catalog = useResource(resourceKeys.catalog(), loadCatalogProducts);
  const [customerId, setCustomerId] = useState(new URLSearchParams(window.location.search).get("customer") ?? "");
  const workspace = useResource(customerId ? resourceKeys.customerWorkspace(customerId) : null, () => loadCustomerWorkspace(customerId));
  const [newCustomer, setNewCustomer] = useState(false);
  const [query, setQuery] = useState("");
  const [cui, setCui] = useState(""); const [name, setName] = useState("");
  const [address, setAddress] = useState(""); const [city, setCity] = useState("");
  const [title, setTitle] = useState(""); const [description, setDescription] = useState("");
  const [productCode, setProductCode] = useState<string | null>(null);
  const [pending, setPending] = useState(false); const saving = useRef(false);
  const [lookupPending, setLookupPending] = useState(false);
  const [notice, setNotice] = useState<string | null>(null); const [error, setError] = useState<string | null>(null);
  const [lookupCustomers, setLookupCustomers] = useState<ReturnType<typeof presentCustomerList>>([]);
  const generation = useRef(0);
  useEffect(() => () => { generation.current += 1; }, []);
  const allCustomers = [...(customers.data ?? []), ...lookupCustomers.filter(c => !(customers.data ?? []).some(item => item.customerId === c.customerId))];
  const selected = allCustomers.find(c => c.customerId === customerId) ?? workspace.data?.customer;
  const visibleCustomers = allCustomers.filter(c => c.customerId === customerId || [c.displayName, c.cui, c.city].some(value => value?.toLocaleLowerCase("ro").includes(query.toLocaleLowerCase("ro"))));
  const selectedProduct = catalog.data?.find(product => product.code === productCode);
  const canSave = !pending && !lookupPending && Boolean(title.trim() && description.trim()) && (newCustomer ? Boolean(name.trim()) : workspace.data?.canCreateRequest === true);

  async function lookup() {
    const scope = ++generation.current;
    setLookupPending(true); setNotice(null); setError(null);
    try {
      const body = asRecord(await lookupCustomerByCui(cui));
      if (scope !== generation.current) return;
      if (body?.status === "existing" || body?.status === "conflict") {
        const found = presentCustomerList(body); setLookupCustomers(found);
        if (found.length === 1) { setCustomerId(found[0]!.customerId); setNewCustomer(false); setNotice("Clientul există deja în sistem. A fost selectat pentru această cerere."); }
        else { setNewCustomer(false); setCustomerId(""); setQuery(cui.replace(/^RO\s*/i, "")); setNotice("Există mai mulți clienți cu acest CUI. Selectează înregistrarea corectă."); }
      } else if (body?.status === "found") {
        const profile = asRecord(body.profile);
        setName(asString(profile?.displayName) ?? ""); setAddress(asString(profile?.address) ?? ""); setCity(asString(profile?.city) ?? ""); setCui(asString(profile?.cui) ?? cui);
        setNotice("Date preluate din ANAF. Verifică-le înainte de salvare.");
      } else if (body?.status === "not_found") setNotice("CUI-ul nu a fost găsit în ANAF. Poți completa clientul manual.");
      else setError("Datele primite nu pot fi prezentate. Poți completa clientul manual.");
    } catch (e) {
      if (scope !== generation.current) return;
      setError(e instanceof TransportError && readTransportErrorCode(e.body) === "invalid_cui" ? "Introdu un CUI numeric valid, cu sau fără RO." : "Verificarea CUI nu este disponibilă acum. Reîncearcă sau completează manual.");
    } finally { if (scope === generation.current) setLookupPending(false); }
  }

  async function save() {
    if (saving.current || lookupPending || !title.trim() || !description.trim() || (!newCustomer && workspace.data?.canCreateRequest !== true) || (newCustomer && !name.trim())) return;
    saving.current = true; setPending(true); setError(null);
    const scope = generation.current;
    let ownedId = customerId;
    try {
      if (newCustomer) {
        const created = presentCustomer(await createCustomer(name.trim(), { cui: cui.trim(), address: address.trim(), city: city.trim() }));
        if (!created) throw new Error("unpresentable_customer");
        ownedId = created.customerId;
        invalidateAfterCreateCustomer();
        if (scope !== generation.current) return;
        setLookupCustomers(current => [...current, created]); setCustomerId(ownedId); setNewCustomer(false);
      }
      const result = await createRequest({ customerId: ownedId, title: title.trim(), description: description.trim() });
      const requestId = presentCreatedRequestId(result);
      if (!requestId) throw new Error("unpresentable_request");
      invalidateAfterCreateRequest(ownedId);
      if (scope !== generation.current) return;
      const previous = readConfiguratorSession();
      writeConfiguratorSession({ ...previous, customerId: ownedId, requestId, productCode, customerLabel: selected?.displayName ?? name.trim(), requestLabel: title.trim() });
      navigate(productCode ? configuratorHref({ customerId: ownedId, requestId, productCode }) : requestHref(requestId));
    } catch (e) {
      if (scope !== generation.current) return;
      if (e instanceof TransportError && readTransportErrorCode(e.body) === "duplicate_cui") {
        const found = presentCustomerList(e.body); setLookupCustomers(found); setNewCustomer(false);
        setCustomerId(found.length === 1 ? found[0]!.customerId : "");
        setError("Clientul există deja. Verifică selecția și salvează din nou cererea; nu a fost creat un duplicat.");
      } else setError("Cererea nu a putut fi salvată. Datele introduse sunt păstrate pentru reîncercare.");
    } finally { saving.current = false; if (scope === generation.current) setPending(false); }
  }

  const undecidedChoice = <button type="button" disabled={pending} aria-pressed={productCode === null} onClick={() => setProductCode(null)}>
    <span><strong>Momentan indecis</strong><span>Aleg produsul ulterior din cerere.</span></span>
    <span className="product-picker__action">{productCode === null ? "Selectat" : "Alege"}</span>
  </button>;

  return <SlicePage contextLabel="Cereri" currentHref="/cereri/noua" workspace="stack" surface="cereri-intake" eyebrow="Registru comercial" title="Cerere nouă" lead="Alege clientul, descrie lucrarea și selectează produsul. Poți decide produsul și mai târziu." action={<a className="text-link request-intake__back" href="/cereri">← Toate cererile</a>}>
    <form className="request-intake-form" onSubmit={e => { e.preventDefault(); void save(); }}>
      <div className="request-intake-form__context">
      <fieldset className="request-intake-form__section" disabled={pending || lookupPending}><legend>1. Client</legend>
        <div className="request-intake-form__modes"><Button variant="secondary" aria-pressed={!newCustomer} onClick={() => { setNewCustomer(false); setError(null); }}>Client existent</Button><Button variant="secondary" aria-pressed={newCustomer} onClick={() => { setNewCustomer(true); setCustomerId(""); setNotice(null); setError(null); }}>Adaugă client rapid</Button></div>
        {newCustomer ? <>
          <div className="request-intake-form__lookup"><label>CUI<input value={cui} disabled={lookupPending} onChange={e => { setCui(e.target.value); setNotice(null); }} placeholder="Cu sau fără RO" aria-describedby="request-intake-cui-hint" /></label><Button variant="secondary" disabled={!cui.trim() || lookupPending} onClick={() => void lookup()}>{lookupPending ? "Se verifică…" : "Preia datele după CUI"}</Button></div>
          <p id="request-intake-cui-hint" className="request-intake__hint">Verificăm întâi dacă firma există deja. Dacă preluarea nu este disponibilă, poți completa datele manual.</p>
          <div className="request-intake-form__fields"><label>Denumire client<input required value={name} disabled={lookupPending} onChange={e => setName(e.target.value)} /></label><label>Localitate<input value={city} disabled={lookupPending} onChange={e => setCity(e.target.value)} /></label><label className="request-intake-form__wide-field">Adresă<input value={address} disabled={lookupPending} onChange={e => setAddress(e.target.value)} /></label></div>
        </> : <>
          <label>Caută client<input type="search" value={query} onChange={e => setQuery(e.target.value)} placeholder="Nume, CUI sau localitate" /></label>
          <label>Client existent<select value={customerId} required onChange={e => { setCustomerId(e.target.value); setError(null); }}><option value="">Selectează clientul</option>{visibleCustomers.map(c => <option key={c.customerId} value={c.customerId}>{c.displayName}{c.cui ? ` · ${c.cui}` : ""}{c.status === "RETIRED" ? " · Retras" : ""}</option>)}</select></label>
          {customers.status === "loading" && !customers.data && <p className="request-intake__hint" role="status">Se încarcă lista clienților…</p>}
          {customerId && selected && <div className="request-intake__client" role="group" aria-label="Client selectat"><strong>{selected.displayName}</strong><span>{[selected.cui ? `CUI ${selected.cui}` : null, selected.city].filter(Boolean).join(" · ")}</span>{workspace.status === "loading" && <span role="status">Se verifică clientul…</span>}</div>}
          {customers.status === "error" && <InlineAlert tone="error" title="Clienții nu au putut fi citiți"><Button variant="secondary" onClick={() => invalidateResources(resourceKeys.customerIntake())}>Reîncearcă</Button></InlineAlert>}
          {customerId && workspace.status === "error" && <InlineAlert tone="error" title="Clientul nu a putut fi verificat"><Button variant="secondary" onClick={() => invalidateResources(resourceKeys.customerWorkspace(customerId))}>Reîncearcă verificarea</Button></InlineAlert>}
          {customerId && workspace.data?.canCreateRequest === false && <p>Nu poți crea o cerere pentru acest client.</p>}
        </>}
        {notice && <p className="request-intake__notice" role="status">{notice}</p>}
      </fieldset>
      <fieldset className="request-intake-form__section request-intake-form__brief" disabled={pending}><legend>2. Lucrarea solicitată</legend><label>Titlu cerere<input required value={title} onChange={e => setTitle(e.target.value)} placeholder="Ce trebuie realizat?" /></label><label>Descriere<textarea required value={description} onChange={e => setDescription(e.target.value)} placeholder="Descrie lucrarea și cerințele cunoscute." aria-describedby="request-intake-brief-hint" /></label><p id="request-intake-brief-hint" className="request-intake__hint">Detaliile tehnice se completează la configurarea produsului.</p></fieldset>
      </div>
      <fieldset className="request-intake-form__section request-intake-form__products" disabled={pending}><legend>3. Produs de pornire</legend>
        <p className="request-intake__hint">Alege produsul de configurat sau continuă cu „Momentan indecis”. Poți adăuga alte produse în aceeași cerere.</p>
        {catalog.data ? <ProductPicker variant="choices" products={catalog.data} leadingChoice={undecidedChoice} selectedCode={productCode} actionLabel="Alege" disabled={pending} onChoose={p => setProductCode(p.code)} /> : <div className="product-picker product-picker--choices"><ul className="product-picker__list"><li>{undecidedChoice}</li></ul></div>}
        {catalog.status === "loading" && !catalog.data && <p className="request-intake__hint" role="status">Se încarcă produsele disponibile…</p>}
        {catalog.status === "error" && <InlineAlert tone="error" title="Produsele nu au putut fi citite">Poți salva cererea cu produsul momentan indecis.<Button variant="secondary" onClick={() => invalidateResources(resourceKeys.catalog())}>Reîncearcă</Button></InlineAlert>}
      </fieldset>
      {error && <InlineAlert tone="error" title="Verifică înainte de continuare">{error}</InlineAlert>}
      <div className="request-intake-form__footer">
        <div className="request-intake__summary"><strong>{newCustomer ? name.trim() || "Client nou" : (customerId && selected?.displayName) || "Client de selectat"} · {productCode ? selectedProduct?.label ?? "Produs selectat" : "Momentan indecis"}</strong><p className="request-intake__hint">{productCode ? "Cererea se salvează înainte de configurarea produsului." : "După salvare poți alege produsul din cerere."}</p></div>
        <div className="request-intake-form__actions"><a className="text-link" href="/cereri">Anulează</a><Button type="submit" disabled={!canSave}>{pending ? "Se salvează…" : productCode ? "Creează cererea și configurează" : "Salvează cererea"}</Button></div>
      </div>
    </form>
  </SlicePage>;
}
