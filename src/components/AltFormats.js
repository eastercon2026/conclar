import { useState, useRef, useCallback, useEffect } from "react";
import { useStoreState } from "easy-peasy";
import { buildPdf } from "../utils/buildPdf";
import { buildIcal } from "../utils/buildIcal";
import configData from "../config.json";

const STANDARD_SIZES = {
  titleSize: 12, timeSize: 11, eventTitleSize: 10, detailSize: 10, pageNumSize: 10,
  orientation: 'landscape', columns: 2
};

const LARGE_PRINT_SIZES = {
  titleSize: 24, timeSize: 20, eventTitleSize: 16, detailSize: 16, pageNumSize: 16,
  headerSize: 16
};

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function useDelayedFlag(delay = 1000) {
  const [visible, setVisible] = useState(false);
  const timerRef = useRef(null);

  const start = useCallback(() => {
    timerRef.current = setTimeout(() => setVisible(true), delay);
  }, [delay]);

  const stop = useCallback(() => {
    clearTimeout(timerRef.current);
    setVisible(false);
  }, []);

  useEffect(() => {
    return () => clearTimeout(timerRef.current);
  }, []);

  return [visible, start, stop];
}

function usePdfGenerator(events, sizes, filename) {
  const [generating, start, stop] = useDelayedFlag();

  const handleGenerate = useCallback(async (e) => {
    e.preventDefault();
    start();
    try {
      const pdf = await buildPdf(events, sizes, configData.APP_TITLE);
      const blob = pdf.output('blob');
      downloadBlob(blob, filename);
    } finally {
      stop();
    }
  }, [events, sizes, filename, start, stop]);

  return [generating, handleGenerate];
}

const AltFormats = () => {
  const program = useStoreState((state) => state.program);
  const mySelections = useStoreState((state) => state.mySelections);

  const myProgram = program.filter((item) => mySelections.includes(item.id));
  const filePrefix = configData.APP_TITLE.toLowerCase().replace(/[^a-z0-9]+/g, '-');

  const [generatingStandard, handleGenerateStandard] = usePdfGenerator(program, STANDARD_SIZES, filePrefix + '.pdf');
  const [generatingLarge, handleGenerateLarge] = usePdfGenerator(program, LARGE_PRINT_SIZES, filePrefix + '-large-print.pdf');
  const [generatingMyStandard, handleGenerateMyStandard] = usePdfGenerator(myProgram, STANDARD_SIZES, filePrefix + '-personal.pdf');
  const [generatingMyLarge, handleGenerateMyLarge] = usePdfGenerator(myProgram, LARGE_PRINT_SIZES, filePrefix + '-personal-large-print.pdf');

  const handleGenerateMyIcal = (e) => {
    e.preventDefault();
    const ics = buildIcal(myProgram);
    const blob = new Blob([ics], { type: 'text/calendar' });
    downloadBlob(blob, filePrefix + '-personal.ics');
  };

  const labels = configData.ALT_FORMATS;

  return (
    <div className="alt-formats">
      <h2>{labels.FULL_SCHEDULE}</h2>
      <ul>
        <li>
          <a href="#" onClick={handleGenerateStandard}>{labels.PDF}</a>
          {generatingStandard && <span className="alt-formats-status">{labels.GENERATING}</span>}
        </li>
        <li>
          <a href="#" onClick={handleGenerateLarge}>{labels.LARGE_PRINT_PDF}</a>
          {generatingLarge && <span className="alt-formats-status">{labels.GENERATING}</span>}
        </li>
      </ul>
      <h2>{labels.MY_SCHEDULE}</h2>
      {myProgram.length === 0 ? (
        <p>{labels.MY_SCHEDULE_EMPTY}</p>
      ) : (
        <ul>
          <li>
            <a href="#" onClick={handleGenerateMyStandard}>{labels.PDF}</a>
            {generatingMyStandard && <span className="alt-formats-status">{labels.GENERATING}</span>}
          </li>
          <li>
            <a href="#" onClick={handleGenerateMyLarge}>{labels.LARGE_PRINT_PDF}</a>
            {generatingMyLarge && <span className="alt-formats-status">{labels.GENERATING}</span>}
          </li>
          <li>
            <a href="#" onClick={handleGenerateMyIcal}>{labels.ICAL}</a>
          </li>
        </ul>
      )}
    </div>
  );
};

export default AltFormats;
