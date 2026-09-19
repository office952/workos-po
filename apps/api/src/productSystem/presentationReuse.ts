import {
  presentProductSystem,
  type DisplayLabelCatalog,
} from "@workos-final/domain";

type ProductSystemPresentation = ReturnType<typeof presentProductSystem>;

export type ProductSystemPresentationReuse = {
  labels(): DisplayLabelCatalog;
  present(): ProductSystemPresentation;
  invalidate(): void;
};

export function createProductSystemPresentationReuse(input: {
  loadLabels: () => DisplayLabelCatalog;
  present: (labels: DisplayLabelCatalog) => ProductSystemPresentation;
}): ProductSystemPresentationReuse {
  let labels: DisplayLabelCatalog | undefined;
  let presentation: ProductSystemPresentation | undefined;

  const currentLabels = (): DisplayLabelCatalog => {
    labels ??= input.loadLabels();
    return labels;
  };

  return {
    labels: currentLabels,
    present() {
      presentation ??= input.present(currentLabels());
      return presentation;
    },
    invalidate() {
      labels = undefined;
      presentation = undefined;
    },
  };
}
