import type { ProcessGraphEvidenceState, ProcessGraphNodeView, ProcessGraphRecipeView } from "../../../adapters/catalogProcessGraphAdapter";

type GraphInspectorProps = {
  node: ProcessGraphNodeView | null;
};

export function GraphInspector({ node }: GraphInspectorProps) {
  if (!node) {
    return <p className="process-graph__inspector-empty">Selectează o operație ca să vezi relațiile și dovada de cost.</p>;
  }
  return (
    <div className="process-graph__inspector">
      <h3>{node.processLabel}</h3>
      <p>{node.scopeLabel}{node.typeLabel ? ` · ${node.typeLabel}` : ""}</p>
      <p>{node.reason}</p>
      <h4>Depinde de</h4>
      <p>{node.dependsOnLabels.length > 0 ? node.dependsOnLabels.join(", ") : "Nicio operație anterioară."}</p>
      <h4>Urmează după această operație</h4>
      <p>{node.successorLabels.length > 0 ? node.successorLabels.join(", ") : "Nicio operație ulterioară."}</p>
      <h4>Condiție</h4>
      <p>{node.conditionLabel ?? "Operație mereu inclusă în acest scenariu."}</p>
      <h4>Blocaje confirmate</h4>
      {node.blockers.length > 0 ? (
        <ul>{node.blockers.map((blocker) => <li key={blocker}>{blocker}</li>)}</ul>
      ) : (
        <p>{node.nodeReadinessLabel}</p>
      )}
      <h4>Rețetă și dovadă</h4>
      {node.recipe ? <RecipeDetails recipe={node.recipe} /> : <p>Nu există o rețetă legată de această operație, pe acest rol.</p>}
      <p className="process-graph__links">
        {node.technicalHref ? <a className="text-link" href={node.technicalHref}>Setările componentei</a> : null}
        {node.formulaHref ? <a className="text-link" href={node.formulaHref}>Formulele componentei</a> : null}
        {node.recipe ? <a className="text-link" href={node.recipe.resourcesHref}>Dovezile de cost</a> : null}
      </p>
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
      ) : null}
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
