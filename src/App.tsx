/* eslint-disable @typescript-eslint/no-unused-vars */
import { useState } from "react";
import "./App.css";
import { MergedSegment, Segment } from "./App.types";

function App() {
  const [histories, setHistories] = useState([]);

  const [errMsg, setErrMsg] = useState<string[]>([]);

  const [editIndex, setEditIndex] = useState(-1);
  const [unmergedIndex, setUnmergedIndex] = useState(-1);

  const [originals, setOriginals] = useState<Segment[]>([]);
  const [mergeds, setMergeds] = useState<MergedSegment[]>([]);

  const [selectedMerged, setSelectedMerged] = useState<number[]>([]);
  const [selectedUnmerged, setSelectedUnmerged] = useState<number[]>([]);

  const processFile = async (newFile: File) => {
    console.log(newFile);
    try {
      if (newFile.type.toLocaleLowerCase() !== "application/json") {
        throw new Error("not json");
      }

      const parsed: Segment[] = JSON.parse(await newFile.text());

      setOriginals((prev) =>
        [...prev, ...parsed].sort((a, b) => a.start - b.start)
      );
      let prevMergedIdx = -1;
      let prevNewIdx = -1;
      let prevIdxOnMerged = 0;
      setMergeds((prev) =>
        [...prev, ...(parsed as MergedSegment[])]
          .sort((a, b) => a.start - b.start)
          .map((item, idx) => {
            let _idx = 0;

            if (idx !== 0) {
              if (item.mergedIndex === prevMergedIdx) {
                _idx = prevNewIdx;
                prevIdxOnMerged = item.indexOnMerged + 1;
              } else {
                _idx = prevNewIdx + 1;
                prevIdxOnMerged = 0;
              }
            }

            prevMergedIdx = item.mergedIndex || 0;
            prevNewIdx = _idx;
            return {
              ...item,
              mergedIndex: _idx,
              indexOnMerged: prevIdxOnMerged,
              mergedLength: item.mergedLength || 1,
              originalIndex: idx,
            };
          })
      );
    } catch (e) {
      setErrMsg((prev) => [
        ...prev,
        `File ${newFile.name} is not valid (${e.message})`,
      ]);
    }
  };

  const handleSelectMerged = (idx: number) => {
    if (selectedMerged.includes(idx)) {
      const isCutBottom =
        idx - selectedMerged[0] >
        selectedMerged[selectedMerged.length - 1] - idx;

      if (isCutBottom)
        setSelectedMerged((prev) =>
          prev.slice(
            0,
            prev.findIndex((i) => i === idx)
          )
        );
      else
        setSelectedMerged((prev) =>
          prev.slice(prev.findIndex((i) => i === idx) + 1)
        );
    } else {
      if (selectedMerged.length) {
        const start = Math.min(idx, selectedMerged[0]);
        const end = Math.max(idx, selectedMerged[selectedMerged.length - 1]);

        setSelectedMerged(
          Array.from({ length: end - start + 1 }, (_, index) => start + index)
        );
      } else {
        setSelectedMerged([idx]);
      }
    }
  };

  const handleMerge = () => {
    const _mergeds = [...mergeds];

    let isAdjust = false;
    let diff = 0;

    const mergedLength = _mergeds.reduce(
      (total, curr) =>
        total + (selectedMerged.includes(curr.mergedIndex) ? 1 : 0),
      0
    );

    _mergeds.forEach((merged, idx) => {
      if (selectedMerged.includes(merged.mergedIndex)) {
        if (idx > 0 && selectedMerged.includes(_mergeds[idx - 1].mergedIndex)) {
          merged.indexOnMerged = _mergeds[idx - 1].indexOnMerged + 1;
          merged.mergedIndex = _mergeds[idx - 1].mergedIndex;
        } else {
          merged.indexOnMerged = 0;
          merged.mergedIndex = idx === 0 ? 0 : mergeds[idx - 1].mergedIndex + 1;
        }
        isAdjust = true;
        merged.mergedLength = mergedLength;
      } else if (isAdjust) {
        if (selectedMerged.includes(_mergeds[idx - 1].mergedIndex)) {
          diff = merged.mergedIndex - _mergeds[idx - 1].mergedIndex - 1;
        }

        merged.mergedIndex = merged.mergedIndex - diff;
      }
    });

    setMergeds(_mergeds);
    setSelectedMerged([]);
  };

  const handleSelectUnmerged = (idx: number, group: MergedSegment[]) => {
    if (selectedUnmerged.includes(idx)) {
      const isCutBottom =
        idx - selectedUnmerged[0] >
        selectedUnmerged[selectedUnmerged.length - 1] - idx;

      if (isCutBottom) {
        if (selectedUnmerged[0] > group[0].originalIndex)
          setSelectedUnmerged((prev) =>
            prev.slice(prev.findIndex((i) => i === idx) + 1)
          );
        else
          setSelectedUnmerged((prev) =>
            prev.slice(
              0,
              prev.findIndex((i) => i === idx)
            )
          );
      } else {
        if (
          selectedUnmerged[selectedUnmerged.length - 1] <
          group[group.length - 1].originalIndex
        )
          setSelectedUnmerged((prev) =>
            prev.slice(
              0,
              prev.findIndex((i) => i === idx)
            )
          );
        else
          setSelectedUnmerged((prev) =>
            prev.slice(prev.findIndex((i) => i === idx) + 1)
          );
      }
    } else {
      if (selectedUnmerged.length) {
        const start = Math.min(idx, selectedUnmerged[0]);
        const end = Math.max(
          idx,
          selectedUnmerged[selectedUnmerged.length - 1]
        );

        setSelectedUnmerged(
          Array.from({ length: end - start + 1 }, (_, index) => start + index)
        );
      } else {
        const isCutBottom =
          idx - group[0].originalIndex >
          group[group.length - 1].originalIndex - idx;

        if (!isCutBottom)
          setSelectedUnmerged(
            group
              .slice(0, group.findIndex((i) => i.originalIndex === idx) + 1)
              .map((g) => g.originalIndex)
          );
        else
          setSelectedUnmerged(
            group
              .slice(group.findIndex((i) => i.originalIndex === idx))
              .map((g) => g.originalIndex)
          );
      }
    }
  };

  const handleUnmerge = () => {
    const _mergeds = [...mergeds];

    let isAdjust = false;
    let diff = 0;

    _mergeds.forEach((item, idx) => {
      if (selectedUnmerged.includes(item.originalIndex)) {
        item.indexOnMerged = 0;
        item.mergedIndex = idx === 0 ? 0 : mergeds[idx - 1].mergedIndex + 1;
        item.mergedLength = 1;
        isAdjust = true;
      } else if (isAdjust) {
        if (selectedUnmerged.includes(_mergeds[idx - 1].originalIndex)) {
          diff = item.mergedIndex - _mergeds[idx - 1].mergedIndex - 1;
        }

        item.mergedIndex = item.mergedIndex - diff;
      }
    });

    setMergeds(_mergeds);
    setSelectedUnmerged([]);
    setUnmergedIndex(-1);
  };

  const handleExportSrt = () => {
    const srtList = mergeds.map((item, idx) => {
      if (item.indexOnMerged === 0) {
        const group = mergeds.slice(idx, idx + item.mergedLength);

        let date = new Date(0);
        date.setMilliseconds(group[0].start * 1000);
        const start = date.toISOString().substring(11, 23).replace(".", ",");

        date = new Date(0);
        date.setMilliseconds(group[group.length - 1].end * 1000);
        const end = date.toISOString().substring(11, 23).replace(".", ",");

        let text = `${item.mergedIndex + 1}\n`;

        text += `${start} --> ${end}\n`;
        text += group.map((g) => g.text).join("") + "\n";
        return text;
      }

      return "";
    });

    const srt = srtList.join("\n");

    const blob = new Blob([srt]);
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.download = "test.srt";
    link.href = url;
    link.click();
  };

  return (
    <>
      <h1>Aab Subtitle Editor</h1>
      <div className="my-5">
        <input
          type="file"
          multiple
          accept="application/JSON"
          onChange={(e) => {
            if (e.target.files) {
              for (let i = 0; i < e.target.files.length; i++) {
                processFile(e.target.files[i]);
              }
              e.target.files = null;
              e.target.value = "";
            }
          }}
        />
      </div>
      <div className="relative overflow-x-auto shadow-md sm:rounded-lg">
        <table className="w-full text-sm text-left rtl:text-right text-gray-500 dark:text-gray-400">
          <thead className="text-xs text-gray-700 uppercase bg-gray-50 dark:bg-gray-700 dark:text-gray-400">
            <tr>
              <th scope="col" className="px-6 py-3">
                Original
              </th>
              <th scope="col" className="px-6 py-3">
                Merged
              </th>
              <th>
                <button
                  onClick={() => handleMerge()}
                  disabled={!selectedMerged.length}
                  className="disabled:cursor-not-allowed disabled:hover:border-transparent"
                >
                  merge
                </button>
              </th>
            </tr>
          </thead>
          <tbody>
            {mergeds.map((item, idx) => (
              <tr
                className="bg-white border-b dark:bg-gray-800 dark:border-gray-700"
                key={idx}
              >
                <td
                  className="px-6 py-4"
                  onDoubleClick={() => {
                    setEditIndex(idx);
                  }}
                >
                  {editIndex === idx ? (
                    <input
                      value={item.text}
                      onChange={(e) => {
                        const _mergeds = [...mergeds];
                        _mergeds[idx].text = e.target.value;
                        setMergeds(_mergeds);
                      }}
                      onBlur={() => {
                        setEditIndex(-1);
                      }}
                    />
                  ) : (
                    item.text
                  )}
                </td>
                {item.indexOnMerged === 0 && (
                  <>
                    <td
                      className="px-6 py-4"
                      rowSpan={item.mergedLength}
                      onDoubleClick={() => {
                        if (item.mergedLength > 1) {
                          setSelectedUnmerged([]);
                          setUnmergedIndex(item.mergedIndex);
                        }
                      }}
                    >
                      {item.mergedIndex === unmergedIndex ? (
                        <>
                          {mergeds
                            .slice(idx, idx + item.mergedLength)
                            .map((i, idx, group) => (
                              <div
                                className="w-full mb-2 flex justify-between"
                                key={idx}
                              >
                                {i.text}
                                <input
                                  type="checkbox"
                                  checked={selectedUnmerged.includes(
                                    i.originalIndex
                                  )}
                                  onChange={() =>
                                    handleSelectUnmerged(i.originalIndex, group)
                                  }
                                />
                              </div>
                            ))}
                          <div className="mt-4 flex gap-2">
                            <button
                              onClick={() => {
                                setSelectedUnmerged([]);
                                setUnmergedIndex(-1);
                              }}
                            >
                              cancel
                            </button>
                            <button
                              onClick={() => {
                                if (selectedUnmerged.length < item.mergedLength)
                                  setSelectedUnmerged(
                                    mergeds
                                      .slice(idx, idx + item.mergedLength)
                                      .map((g) => g.originalIndex)
                                  );
                                else setSelectedUnmerged([]);
                              }}
                            >
                              {selectedUnmerged.length < item.mergedLength
                                ? "select"
                                : "unselect"}{" "}
                              all
                            </button>
                            <button
                              onClick={() => handleUnmerge()}
                              disabled={!selectedUnmerged.length}
                              className="disabled:cursor-not-allowed disabled:hover:border-transparent"
                            >
                              unmerge
                            </button>
                          </div>
                        </>
                      ) : (
                        mergeds
                          .slice(idx, idx + mergeds[idx].mergedLength)
                          .map((item) => item.text)
                          .join("")
                      )}
                    </td>
                    <td
                      className="px-6 py-4"
                      rowSpan={mergeds[idx].mergedLength}
                    >
                      <input
                        type="checkbox"
                        checked={selectedMerged.includes(
                          mergeds[idx].mergedIndex
                        )}
                        onChange={() =>
                          handleSelectMerged(mergeds[idx].mergedIndex)
                        }
                      />
                    </td>
                  </>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="mt-4">
        <button
          onClick={() => handleExportSrt()}
          disabled={!mergeds.length}
          className="disabled:cursor-not-allowed disabled:hover:border-transparent"
        >
          export to srt
        </button>
      </div>
    </>
  );
}

export default App;
