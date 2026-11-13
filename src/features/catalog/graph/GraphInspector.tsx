import type { ProcessGraphEvidenceState, ProcessGraphNodeView, ProcessGraphRecipeView } from "../../../adapters/catalogProcessGraphAdapter";

type GraphInspectorProps = {
  node: ProcessGraphNodeView | null;
};

export function GraphInspector({ node }: GraphInspectorProps) {
  if (!node) {
    return <p className="process-graph__inspector-empty">Selectează o operație ca să vezi relațiile și dovada de cost.</p>;
  }
  return (
    <div className="process-graph__inspector" aria-live="polite">
      <div className="process-graph__inspector-main">
        <p className="process-graph__inspector-label">Operație selectată</p>
        <h3>{node.processLabel}</h3>
        <p className="process-graph__inspector-meta">{node.scopeLabel}{node.typeLabel ? ` · ${node.typeLabel}` : ""} · {node.nodeReadinessLabel}</p>
        <p>{node.reason}</p>
        <h4>Condiție</h4>
        <p>{node.conditionLabel ?? "Operație mereu inclusă în acest scenariu."}</p>
        <h4>Blocaje confirmate</h4>
        {node.blockers.length > 0 ? (
          <ul>{node.blockers.map((blocker) => <li key={blocker}>{blocker}</li>)}</ul>
        ) : (
          <p>{node.nodeReadinessLabel}</p>
        )}
      </div>
      <div className="process-graph__inspector-relations">
        <h4>Depinde de</h4>
        {node.dependsOnLabels.length > 0 ? (
          <ul>{node.dependsOnLabels.map((label) => <li key={label}>{label}</li>)}</ul>
        ) : <p>Nicio operație anterioară.</p>}
        <h4>Urmează după această operație</h4>
        {node.successorLabels.length > 0 ? (
          <ul>{node.successorLabels.map((label) => <li key={label}>{label}</li>)}</ul>
        ) : <p>Nicio operație ulterioară.</p>}
      </div>
      <div className="process-graph__inspector-evidence">
        <h4>Capabilitate cerută</h4>
        <p>{node.capabilityLabel ?? "Capabilitatea nu este înregistrată pentru această operație."}</p>
        <p className="process-graph__inspector-meta">Nu se atribuie oameni sau utilaje din acest ecran.</p>
        <h4>Rețetă și dovadă</h4>
        {node.recipe ? <RecipeDetails recipe={node.recipe} /> : <p>Nu există o rețetă legată de această operație, pe acest rol.</p>}
        <p className="process-graph__links">
          {node.technicalHref ? <a className="catv2-link" href={node.technicalHref}>Setările componentei</a> : null}
          {node.formulaHref ? <a className="catv2-link" href={node.formulaHref}>Formulele componentei</a> : null}
          {node.recipe ? <a className="catv2-link" href={node.recipe.resourcesHref}>Costuri de producție</a> : null}
          <a className="catv2-link" href="/admin/products">Disponibilitatea produsului</a>
        </p>
      </div>
    </div>
  );
}

function RecipeDetails({ recipe }: { recipe: ProcessGraphRecipeView }) {
  return (
    <>
      <p>{recipe.recipeLabel} · {recipe.recipeKindLabel} · {recipe.recipeLifecycleLabel}</p>
      <p>{recipe.resourceLabel} · {recipe.quantityBasisLabel}</p>
      <p>{evidenceLabel(recipe.evidenceState)}</p>
      {recipe.evidenceSourceLabel ? <p>{recipe.evidenceSourceLabel}{recipe.evidenceClassificationLabel ? ` · ${recipe.evidenceClassificationLabel}` : ""}</p> : null}
      <p>{rateText(recipe)}</p>
      {recipe.sharedWithLabels.length > 0 ? (
        <p>Aceeași dovadă este folosită și de: {recipe.sharedWithLabels.join(", ")}. Ofertele și comenzile deja înregistrate nu se recalculează din acest ecran.</p>
      ) : (
        <p>Nicio altă operație din acest scenariu nu folosește aceeași dovadă. Impactul asupra altor produse nu este calculat aici.</p>
      )}
    </>
  );
}

function evidenceLabel(state: ProcessGraphEvidenceState): string {
  switch (state) {
    case "PRESENT":
      return "Dovadă înregistrată";
    case "PRESENT_NEEDS_VERIFICATION":
      return "Dovadă care cere verificare";
    case "MISSING":
      return "Dovadă lipsă";
    default: {
      const exhaustive: never = state;
      return exhaustive;
    }
  }
}

function rateText(recipe: ProcessGraphRecipeView): string {
  if (!recipe.rateVisible) {
    return "Tariful nu este afișat în această sesiune.";
  }
  if (recipe.rate === null || recipe.currency === null) {
    return "Tarif lipsă. Absența nu este zero.";
  }
  const amount = new Intl.NumberFormat("ro-RO", { maximumFractionDigits: 4 }).format(recipe.rate);
  return `${amount} ${recipe.currency} / ${recipe.unitLabel}`;
}
