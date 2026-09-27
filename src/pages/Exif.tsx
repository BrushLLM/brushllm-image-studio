import { useEffect, useState } from "react";
import { revealItemInDir } from "@tauri-apps/plugin-opener";
import DropZone from "../components/DropZone";
import OutputPanel, { type OutputConfig } from "../components/OutputPanel";
import PageShell from "../components/PageShell";
import {
  applyExif,
  loadDefaultOutputDir,
  readExif,
  type ExifAction,
  type ExifField,
} from "../lib/ipc";
import { blockedInputError, EXIF_FORMATS, unsupportedImageError } from "../lib/types";
import { useTranslation } from "react-i18next";

interface Props {
  onBack: () => void;
}

type Mode = "edit" | "strip_gps" | "strip_all";

export default function Exif({ onBack }: Props) {
  const { t } = useTranslation();
  const [file, setFile] = useState<string | null>(null);
  const [fields, setFields] = useState<ExifField[] | null>(null);
  const [mode, setMode] = useState<Mode>("edit");
  const [dateTime, setDateTime] = useState("");
  const [make, setMake] = useState("");
  const [model, setModel] = useState("");
  const [gpsLat, setGpsLat] = useState("");
  const [gpsLon, setGpsLon] = useState("");
  const [description, setDescription] = useState("");
  const [artist, setArtist] = useState("");
  const [copyright, setCopyright] = useState("");
  const [output, setOutput] = useState<OutputConfig>({
    dir: null,
    suffix: "-exif",
    collision: "rename",
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resultPath, setResultPath] = useState<string | null>(null);

  useEffect(() => {
    loadDefaultOutputDir().then((dir) => {
      if (dir) setOutput((prev) => ({ ...prev, dir }));
    });
  }, []);

  const loadFile = (paths: string[]) => {
    const path = paths[0];
    if (!path) return;
    setFile(path);
    setResultPath(null);
    setError(null);
    setFields(null);
    readExif(path)
      .then((list) => {
        setFields(list);
        const prefill = (tag: string) =>
          list.find((f) => f.tag === tag)?.edit_value ?? "";
        setDateTime(prefill("DateTimeOriginal") || prefill("DateTime"));
        setMake(prefill("Make"));
        setModel(prefill("Model"));
        setGpsLat(prefill("GPSLatitude"));
        setGpsLon(prefill("GPSLongitude"));
        setDescription(prefill("ImageDescription"));
        setArtist(prefill("Artist"));
        setCopyright(prefill("Copyright"));
      })
      .catch((e) => setError(String(e)));
  };

  const run = async () => {
    if (!file || busy) return;
    setBusy(true);
    setError(null);
    setResultPath(null);
    try {
      const action: ExifAction =
        mode === "strip_all"
          ? { kind: "strip_all" }
          : mode === "strip_gps"
            ? { kind: "strip_gps" }
            : {
                kind: "edit",
                date_time: dateTime.trim() || null,
                make: make.trim() || null,
                model: model.trim() || null,
                gps_lat: gpsLat.trim() || null,
                gps_lon: gpsLon.trim() || null,
                description: description.trim() || null,
                artist: artist.trim() || null,
                copyright: copyright.trim() || null,
              };
      const path = await applyExif({
        image_path: file,
        action,
        output: { dir: output.dir, suffix: output.suffix, collision: output.collision },
      });
      setResultPath(path);
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  };

  const gpsCount = fields?.filter((f) => f.is_gps).length ?? 0;

  return (
    <PageShell
      title={t("exif.title")}
      subtitle={t("exif.subtitle")}
      onBack={onBack}
      badge={<span className="badge badge-mint">{t("common.localBadge")}</span>}
    >
      {!file && error && <div className="banner banner-error">{error}</div>}
      {!file && (
        <DropZone
          onFiles={loadFile}
          label={t("exif.dropLabel")}
          multiple={false}
          accept={EXIF_FORMATS}
          hint={t("exif.dropHint")}
          onUnsupported={(files) =>
            setError(unsupportedImageError(files.length, "JPEG or TIFF"))
          }
          onBlockedInput={(files) => setError(blockedInputError(files))}
        />
      )}

      {file && (
        <div className="split">
          <div>
            <div className="card">
              <div className="row" style={{ alignItems: "center", marginBottom: 10 }}>
                <h2 style={{ margin: 0 }}>{t("exif.metadata")}</h2>
                <div style={{ flex: 1 }} />
                {gpsCount > 0 && (
                  <span className="badge badge-warn" style={{ background: "#fffbeb", border: "1px solid #fde68a", color: "#92400e" }}>
                    {gpsCount} GPS fields
                  </span>
                )}
              </div>
              {fields === null && <p className="status-note">Reading…</p>}
              {fields !== null && fields.length === 0 && (
                <p className="status-note">
                  {t("exif.noExif")}
                </p>
              )}
              {fields !== null && fields.length > 0 && (
                <div className="outcome-list" style={{ maxHeight: 340 }}>
                  {fields.map((field, index) => (
                    <div className="outcome-row" key={index}>
                      <span
                        className={`badge ${field.is_gps ? "badge-fail" : "badge-skip"}`}
                        title={field.group}
                      >
                        {field.is_gps ? "GPS" : "EXIF"}
                      </span>
                      <span
                        className="oc-name"
                        title={`${field.tag} (${field.group})`}
                        style={{ flex: "0 0 45%", userSelect: "text" }}
                      >
                        {field.tag}
                      </span>
                      <span className="oc-dim" style={{ flex: 1, userSelect: "text" }} title={field.value}>
                        {field.value}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
          <div className="side-col">
            <div className="card">
              <h2 className="card-title">{t("exif.action")}</h2>
              <div className="field">
                <div className="radio-row">
                  {(
                    [
                      ["edit", "exif.edit"],
                      ["strip_gps", "exif.stripGps"],
                      ["strip_all", "exif.stripAll"],
                    ] as [Mode, string][]
                  ).map(([value, label]) => (
                    <button
                      key={value}
                      className={`radio-chip${mode === value ? " active" : ""}`}
                      onClick={() => setMode(value)}
                    >
                      {t(label)}
                    </button>
                  ))}
                </div>
              </div>

              {mode === "edit" && (
                <>
                  <div className="field">
                    <label>{t("exif.dateTime")}</label>
                    <input
                      type="text"
                      value={dateTime}
                      placeholder={t("exif.dateTimePh")}
                      onChange={(e) => setDateTime(e.target.value)}
                    />
                  </div>
                  <div className="field row">
                    <div>
                      <label>{t("exif.cameraMake")}</label>
                      <input
                        type="text"
                        value={make}
                        placeholder={t("exif.cameraMakePh")}
                        onChange={(e) => setMake(e.target.value)}
                      />
                    </div>
                    <div>
                      <label>{t("exif.cameraModel")}</label>
                      <input
                        type="text"
                        value={model}
                        placeholder={t("exif.cameraModelPh")}
                        onChange={(e) => setModel(e.target.value)}
                      />
                    </div>
                  </div>
                  <div className="field row">
                    <div>
                      <label>{t("exif.gpsLat")}</label>
                      <input
                        type="text"
                        value={gpsLat}
                        placeholder={t("exif.gpsLatPh")}
                        onChange={(e) => setGpsLat(e.target.value)}
                      />
                    </div>
                    <div>
                      <label>{t("exif.gpsLon")}</label>
                      <input
                        type="text"
                        value={gpsLon}
                        placeholder={t("exif.gpsLonPh")}
                        onChange={(e) => setGpsLon(e.target.value)}
                      />
                    </div>
                  </div>
                  <div className="field">
                    <label>{t("exif.description")}</label>
                    <input
                      type="text"
                      value={description}
                      placeholder={t("exif.descriptionPh")}
                      onChange={(e) => setDescription(e.target.value)}
                    />
                  </div>
                  <div className="field">
                    <label>{t("exif.artist")}</label>
                    <input
                      type="text"
                      value={artist}
                      placeholder={t("exif.artistPh")}
                      onChange={(e) => setArtist(e.target.value)}
                    />
                  </div>
                  <div className="field">
                    <label>{t("exif.copyright")}</label>
                    <input
                      type="text"
                      value={copyright}
                      placeholder={t("exif.copyrightPh")}
                      onChange={(e) => setCopyright(e.target.value)}
                    />
                  </div>
                </>
              )}

              {mode === "strip_gps" && (
                <div className="hint" style={{ marginBottom: 12 }}>
                  {t("exif.stripGpsHint")}
                </div>
              )}
              {mode === "strip_all" && (
                <div className="hint" style={{ marginBottom: 12 }}>
                  Removes EXIF, XMP, IPTC and comments. JPEG and PNG are edited
                  losslessly; other formats are re-encoded.
                </div>
              )}

              <OutputPanel value={output} onChange={setOutput} defaultSuffix="-exif" />
            </div>

            <div className="card">
              <button className="btn btn-primary btn-block" onClick={run} disabled={busy}>
                {busy ? (
                  <>
                    <span className="spinner" /> {t("exif.applying")}
                  </>
                ) : (
                  t("exif.apply")
                )}
              </button>
              {error && (
                <div className="banner banner-error" style={{ marginTop: 12 }}>
                  {error}
                </div>
              )}
              {resultPath && (
                <div
                  className="banner banner-warn"
                  style={{ marginTop: 12, background: "#ecfdf5", borderColor: "#a7f3d0", color: "#065f46" }}
                >
                  <span>✓ Saved to {resultPath}</span>
                  <span className="banner-link" onClick={() => revealItemInDir(resultPath)}>
                    Show in folder
                  </span>
                </div>
              )}
            </div>

            <button className="btn btn-block" style={{ marginTop: 4 }} onClick={() => setFile(null)}>
              {t("common.chooseDifferentImage")}
            </button>
          </div>
        </div>
      )}
    </PageShell>
  );
}
