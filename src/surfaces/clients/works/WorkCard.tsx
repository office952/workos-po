import { useId } from "react";
import type { DossierDocument, WorkItem } from "../../../adapters/customerDossierAdapter";
import type { BandMode } from "../dossier/bandModel";
import { DossierIcon } from "../dossier/dossierIcons";
import { FileList } from "../dossier/history/cardParts";
import { follow } from "../dossier/history/follow";
import { summarizeMatch } from "../dossier/history/matchSummary";
import { orderedPhotos } from "../dossier/historyModel";
import { NoPhoto, PhotoFrame, StateTag } from "../dossier/historyParts";
import { carried, representativeNotice, stateText, workDate, workEyebrow, workImage } from "./worksModel";
import "../../../styles/surfaces/client-representative-photo.css";

export type OpenPhotos = { photos: DossierDocument[]; startId: string; context: string };

/**
 * One work (644:12426, telefon 644:13766, 768 647:14189): identity before the image — where it
 * comes from with its references, the full title, the site, the date, the state — then the image
 * named for what it is, and at the side the way in and the documents on demand (644:12878). A
 * WorkOS work and a historical record share the card; the provenance stays apart from the state.
 * The open card is `deschis=` in the address, so Back and Forward bring it back.
 */
export function WorkCard({
  item,
  mode,
  openHref,
  expanded,
  onToggle,
  onPhotos,
  onFile,
}: {
  item: WorkItem;
  mode: BandMode;
  openHref: string | null;
  expanded: boolean;
  onToggle: () => void;
  onPhotos: (open: OpenPhotos) => void;
  onFile: (document: DossierDocument) => void;
}) {
  const moreId = useId();
  const image = workImage(item);
  const { files, photos, label } = carried(item);
  const historical = item.provenance === "HISTORICAL_RECORD";
  const openLabel = item.job ? "Deschide memoria lucrării" : "Deschide înregistrarea";
  const match = summarizeMatch(item.matchedOn).map((group) => group.label).join(" · ");
  const ownPhotos = orderedPhotos(photos);
  const notice = representativeNotice(item);
  const media =
    image.kind === "own" || image.kind === "chosen" ? (
      <PhotoFrame document={image.photo} size="thumb" label={`Deschide fotografia ${image.photo.title}`} onOpen={() => onPhotos({ photos: ownPhotos, startId: image.photo.documentId, context: item.title })} />
    ) : image.kind === "request" ? (
      <PhotoFrame
        document={image.photo}
        size="thumb"
        label={`Deschide fotografia din cerere ${image.photo.title}`}
        onOpen={() => onPhotos({ photos: orderedPhotos(item.requestPhotos?.photos ?? []), startId: image.photo.documentId, context: `${item.title} · fotografii din cerere` })}
      />
    ) : (
      <NoPhoto size="thumb" />
    );

  return (
    <li className="dwcard" data-provenance={item.provenance} data-state={item.state} data-expanded={expanded || undefined}>
      <div className="dwcard__body">
        <p className="dwcard__eyebrow">
          <DossierIcon name={historical ? "history" : "wrench"} size={13} />
          <span>{workEyebrow(item)}</span>
        </p>
        <h4 className="dwcard__title">{item.title}</h4>
        {/* What was made, when the title does not say it: two works of one request stay apart (648:13594). */}
        {item.detail && item.detail !== item.title ? <p className="dwcard__detail">{item.detail}</p> : null}
        <p className="dwcard__meta">
          {item.site ? (
            <span className="dwcard__site">
              <DossierIcon name="site" size={13} />
              {`${item.site.name}${item.site.active ? "" : " (inactiv)"}`}
            </span>
          ) : null}
          <span className="dwcard__date">{workDate(item)}</span>
          <StateTag state={item.state} label={stateText(item)} />
        </p>
        {match ? <p className="dwcard__match">{`Potrivire: ${match}`}</p> : null}
      </div>
      <div className="dwcard__media">
        {media}
        {image.caption || notice ? (
          <div className="dwcard__caption">
            {image.caption ? <p>{mode === "phone" ? image.caption.replace(/^Imagine: /, "").replace(/^./, (first) => first.toLocaleUpperCase("ro")) : image.caption}</p> : null}
            {/* N-021 · a choice set aside: said once, next to the automatic image that replaced it. */}
            {notice ? <p className="dwcard__notice">{notice}</p> : null}
          </div>
        ) : null}
      </div>
      <div className="dwcard__side">
        {openHref ? (
          <a className="dwcard__open" href={openHref} onClick={(event) => follow(event, openHref)} aria-label={`${openLabel}: ${item.title}`}>
            {`${openLabel} →`}
          </a>
        ) : null}
        {label ? (
          <button type="button" className="dwcard__toggle" aria-expanded={expanded} aria-controls={moreId} onClick={onToggle}>
            {expanded ? "Ascunde documentele" : label}
            <DossierIcon name={expanded ? "chevronUp" : "chevronDown"} size={11} />
          </button>
        ) : (
          <p className="dwcard__nodocs">Fără documente încă</p>
        )}
      </div>
      {expanded && label ? (
        <div className="dwcard__more" id={moreId}>
          {files.length ? (
            <div className="dwcard__group">
              <p className="dwcard__label">{`Documente · ${files.length}`}</p>
              <FileList documents={files} onOpen={onFile} />
            </div>
          ) : null}
          {ownPhotos.length ? (
            <div className="dwcard__group">
              <p className="dwcard__label">{`Fotografii · ${ownPhotos.length}`}</p>
              <ol className="dwcard__photos">
                {ownPhotos.map((photo) => (
                  <li key={photo.documentId}>
                    <PhotoFrame document={photo} size="thumb" label={`Deschide fotografia ${photo.title}`} onOpen={() => onPhotos({ photos: ownPhotos, startId: photo.documentId, context: item.title })} />
                  </li>
                ))}
              </ol>
            </div>
          ) : null}
        </div>
      ) : null}
    </li>
  );
}
