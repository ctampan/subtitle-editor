import { useEffect, useMemo, useRef, useState } from "react";
import "./App.css";
import { MergedSegment, Segment, TimelineSegment } from "./App.types";
import {
  ArrowPathRoundedSquareIcon,
  ArrowUturnLeftIcon,
  ArrowUturnRightIcon,
  PauseCircleIcon,
  PlayCircleIcon,
  TrashIcon,
} from "@heroicons/react/24/solid";
import _ from "lodash";
import ReactPlayer from "react-player";

const NumberToSRTTimestamp = function (target: number) {
  const date = new Date(0);
  date.setMilliseconds(target * 1000);
  return date.toISOString().substring(11, 23).replace(".", ",");
};

function App() {
  const [histories, setHistories] = useState<{ mergeds: MergedSegment[] }[]>(
    []
  );
  const [historyIndex, setHistoryIndex] = useState(-1);
  const preventHistory = useRef(true);

  const [errMsg, setErrMsg] = useState<string[]>([]);

  const [editIndex, setEditIndex] = useState(-1);
  const [unmergedIndex, setUnmergedIndex] = useState(-1);

  const [originals, setOriginals] = useState<Segment[]>([]);
  const [mergeds, onMerged] = useState<MergedSegment[]>([]);

  const [selectedMerged, setSelectedMerged] = useState<number[]>([]);
  const [selectedUnmerged, setSelectedUnmerged] = useState<number[]>([]);

  const [isSelectMergeMode, setSelectMergeMode] = useState(false);
  const [mergeHightlights, setMergeHightlights] = useState<number[]>([]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const { key, shiftKey } = e;

      if (!["j", "k"].includes(key.toLocaleLowerCase())) return;

      const modifier =
        (key.toLocaleLowerCase() === "j" && !shiftKey) ||
        (key.toLocaleLowerCase() === "k" && shiftKey)
          ? 1
          : -1;

      const elementList = document.querySelectorAll(
        '[aab-shortcut="jk"]:not([disabled])'
      );

      let idx = 0;

      for (let i = 0; i < elementList.length; i++) {
        if (elementList[i] === document.activeElement) {
          idx = i + modifier;
        }
      }

      if (idx < 0) idx = elementList.length - 1;
      else if (idx > elementList.length - 1) idx = 0;

      (elementList[idx] as HTMLElement).focus();
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  const setMergeds = (
    _mergeds: ((prev: MergedSegment[]) => MergedSegment[]) | MergedSegment[]
  ) => {
    let __mergeds: MergedSegment[];
    if (typeof _mergeds === "function") {
      __mergeds = _mergeds(mergeds);
    } else {
      __mergeds = _mergeds;
    }
    onMerged(_mergeds);
    if (!preventHistory.current) {
      setHistories((prev) => [
        ...prev.slice(0, historyIndex + 1),
        { mergeds: _.cloneDeep(__mergeds) },
      ]);
      setHistoryIndex((prev) => prev + 1);
    }
    preventHistory.current = false;
  };

  const processFile = async (newFile: File) => {
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

  const handleMerge = (mergedList: number[]) => {
    const _mergeds = [...mergeds];

    let isAdjust = false;
    let diff = 0;
    let firstCallDiff = true;

    const mergedLength = _mergeds.reduce(
      (total, curr) => total + (mergedList.includes(curr.mergedIndex) ? 1 : 0),
      0
    );

    _mergeds.forEach((merged, idx) => {
      if (mergedList.includes(merged.mergedIndex)) {
        if (idx > 0 && mergedList.includes(_mergeds[idx - 1].mergedIndex)) {
          merged.indexOnMerged = _mergeds[idx - 1].indexOnMerged + 1;
          merged.mergedIndex = _mergeds[idx - 1].mergedIndex;
        } else {
          merged.indexOnMerged = 0;
          merged.mergedIndex = idx === 0 ? 0 : mergeds[idx - 1].mergedIndex + 1;
        }
        isAdjust = true;
        merged.mergedLength = mergedLength;
      } else if (isAdjust) {
        if (
          mergedList.includes(_mergeds[idx - 1].mergedIndex) &&
          firstCallDiff
        ) {
          diff = merged.mergedIndex - _mergeds[idx - 1].mergedIndex - 1;
          firstCallDiff = false;
        }

        merged.mergedIndex = merged.mergedIndex - diff;
      }
    });

    setMergeds(_mergeds);
    setSelectedMerged([]);
    setMergeHightlights([]);
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

  const handleUnmerge = (unmergedList: number[], mergedIndex: number) => {
    const _mergeds = [...mergeds];

    let isAdjust = false;
    let diff = 0;
    let firstCallDiff = true;

    _mergeds.forEach((item, idx) => {
      if (
        item.mergedIndex === mergedIndex &&
        !unmergedList.includes(item.originalIndex)
      ) {
        item.mergedLength = item.mergedLength - unmergedList.length;
      }
      if (unmergedList.includes(item.originalIndex)) {
        item.indexOnMerged = 0;
        item.mergedIndex = idx === 0 ? 0 : mergeds[idx - 1].mergedIndex + 1;
        item.mergedLength = 1;
        isAdjust = true;
      } else if (isAdjust) {
        if (
          unmergedList.includes(_mergeds[idx - 1].originalIndex) &&
          firstCallDiff
        ) {
          diff = item.mergedIndex - _mergeds[idx - 1].mergedIndex - 1;
          firstCallDiff = false;
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

        const start = NumberToSRTTimestamp(group[0].start);

        const end = NumberToSRTTimestamp(group[group.length - 1].end);

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

  const handleHightlight = (originalIdx: number) => {
    let idx = originalIdx;
    const mergeHightlights: number[] = [mergeds[idx].mergedIndex];
    while (idx > 0) {
      idx -= 1;
      // if (mergeds[idx].mergedLength > 1 && mergeHightlights.length > 1) break; // legacy logic
      mergeHightlights.push(mergeds[idx].mergedIndex);
      break;
    }
    setMergeHightlights(mergeHightlights);
  };

  const [video, setVideo] = useState<File | null>(null);
  const videoUrl = useMemo(
    () => (video ? URL.createObjectURL(video) : null),
    [video]
  );
  const timeline: TimelineSegment[] = useMemo(() => {
    const _timeline: TimelineSegment[] = [];
    let _idx = 0;
    let tmp: MergedSegment;

    while (_idx < mergeds.length) {
      tmp = mergeds[_idx];
      _timeline.push({
        start: tmp.start,
        end: mergeds[_idx + tmp.mergedLength - 1].end,
        text: mergeds
          .slice(_idx, _idx + tmp.mergedLength)
          .map((item) => item.text)
          .join(""),
        isJump: _idx > 0 && tmp.start !== mergeds[_idx - 1].end,
      });
      _idx += tmp.mergedLength;
    }

    return _timeline;
  }, [mergeds]);
  const [tlIndex, setTlIndex] = useState(0);
  const videoRef = useRef<ReactPlayer>(null);
  const intervalRef = useRef<null | NodeJS.Timeout>(null);
  const [isPlaying, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const isFocusSubsRef = useRef(true);
  const [isFocusSubs, setFocusSubs] = useState(true);

  const handleNextTl = (idx: number) => {
    if (idx >= timeline.length - 1) {
      setPlaying(false);
      setCurrentTime(0);
      setTlIndex(0);
    } else {
      setTlIndex(idx);
      if (isFocusSubsRef.current)
        document.getElementById(`row-merged-${idx - 1}`)?.scrollIntoView();
      intervalRef.current = setTimeout(
        () => handleNextTl(idx + 1),
        (timeline[idx].end - timeline[idx].start) * 1000
      );
      if (timeline[idx].isJump) videoRef.current?.seekTo(timeline[idx].start);
    }
  };

  const toggleVideo = (playing: boolean) => {
    if (playing) {
      if (intervalRef.current) {
        clearTimeout(intervalRef.current);
      }
      intervalRef.current = null;
      setCurrentTime(videoRef.current?.getCurrentTime() || 0);
    } else {
      let _currentTime = currentTime;
      let l = 0;
      let r = timeline.length;
      let m = -1;
      let tl;

      while (l < r) {
        m = Math.floor((l + (r - 1)) / 2);

        if (
          _currentTime >= timeline[m].start &&
          _currentTime <= timeline[m].end
        ) {
          tl = timeline[m];
          break;
        }

        if (
          _currentTime > timeline[m].start &&
          _currentTime > timeline[m].end
        ) {
          l = m + 1;
        } else {
          r = m - 1;
        }
      }

      if (!tl) {
        _currentTime = timeline[m].start;
      }

      videoRef.current?.seekTo(_currentTime);

      setTlIndex(m);
      intervalRef.current = setTimeout(
        () => handleNextTl(m + 1),
        (timeline[m].end - _currentTime) * 1000
      );
    }
    return !playing;
  };

  return (
    <>
      <h1>Aab Subtitle Editor</h1>
      <div className="my-5 flex justify-center gap-4">
        {!video && (
          <div>
            <button
              onClick={() => document.getElementById("video-input")?.click()}
            >
              select video
            </button>
            <input
              id="video-input"
              className="hidden"
              type="file"
              accept="video/*"
              onChange={(e) => {
                if (e.target.files) {
                  setVideo(e.target.files[0]);
                }
              }}
            />
          </div>
        )}
        {mergeds.length === 0 && (
          <div>
            <button
              onClick={() => document.getElementById("subs-input")?.click()}
            >
              select subtitle
            </button>
            <input
              id="subs-input"
              className="hidden"
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
        )}
      </div>
      {!!histories.length && (
        <div className="flex my-4 justify-center gap-8">
          <ArrowUturnLeftIcon
            className={`h-6 w-6 ${
              historyIndex > 0
                ? "text-white cursor-pointer"
                : "text-gray-400 cursor-not-allowed"
            }`}
            onClick={() => {
              if (historyIndex < 1) return;
              preventHistory.current = true;
              const hIdx = historyIndex - 1;
              setHistoryIndex(hIdx);
              setMergeds(_.cloneDeep(histories[hIdx].mergeds));
            }}
          />
          <ArrowUturnRightIcon
            className={`h-6 w-6 ${
              historyIndex < histories.length - 1
                ? "text-white cursor-pointer"
                : "text-gray-400 cursor-not-allowed"
            }`}
            onClick={() => {
              if (historyIndex > histories.length - 2) return;
              preventHistory.current = true;
              const hIdx = historyIndex + 1;
              setHistoryIndex(hIdx);
              setMergeds(_.cloneDeep(histories[hIdx].mergeds));
            }}
          />
          <ArrowPathRoundedSquareIcon
            className={`h-6 w-6 ${
              histories.length > 0
                ? "text-white cursor-pointer"
                : "text-gray-400 cursor-not-allowed"
            }`}
            onClick={() => {
              if (histories.length < 1) return;
              preventHistory.current = true;
              setHistoryIndex(0);
              const _mergeds: MergedSegment[] = originals.map((o, idx) => ({
                ...o,
                mergedIndex: idx,
                indexOnMerged: 0,
                mergedLength: 1,
                originalIndex: idx,
              }));
              setHistories([{ mergeds: _.cloneDeep(_mergeds) }]);
              setMergeds(_.cloneDeep(_mergeds));
            }}
          />
          <TrashIcon
            className={`h-6 w-6 ${
              histories.length > 0
                ? "text-white cursor-pointer"
                : "text-gray-400 cursor-not-allowed"
            }`}
            onClick={() => {
              if (histories.length < 1) return;
              preventHistory.current = true;
              setHistoryIndex(-1);
              setHistories([]);
              setMergeds([]);
              setOriginals([]);
            }}
          />
        </div>
      )}
      <div className="my-4">
        <button
          onClick={() => handleExportSrt()}
          disabled={!mergeds.length}
          className="disabled:cursor-not-allowed disabled:hover:border-transparent disabled:bg-gray-400 disabled:text-gray-500"
        >
          export to srt
        </button>
      </div>
      <div className="flex justify-center gap-8">
        {!!videoUrl && (
          <div className="flex flex-col items-center gap-8">
            <div
              onClick={() => setPlaying(toggleVideo)}
              className="cursor-pointer"
            >
              <ReactPlayer ref={videoRef} url={videoUrl} playing={isPlaying} />
            </div>
            {!!timeline.length && (
              <div className="flex flex-col gap-4 items-center">
                <div className="text-xl">{timeline[tlIndex].text}</div>
                <div className="flex items-center gap-4">
                  <div
                    className="h-8 w-8 cursor-pointer"
                    onClick={() => setPlaying(toggleVideo)}
                  >
                    {isPlaying ? <PauseCircleIcon /> : <PlayCircleIcon />}
                  </div>
                  <button
                    onClick={() => {
                      setFocusSubs((prev) => !prev);
                      isFocusSubsRef.current = !isFocusSubsRef.current;
                    }}
                  >
                    {isFocusSubs ? "disable" : "enable"} subs focus
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
        <div className="relative overflow-auto max-h-[50vh] shadow-md sm:rounded-lg">
          <table className="w-full text-sm text-left rtl:text-right text-gray-400">
            <thead className="text-xs uppercase bg-gray-700 text-gray-400 select-none">
              <tr id={`row-merged--1`} className="h-12">
                <th scope="col" className="px-6 py-3">
                  Original
                </th>
                <th scope="col" className="px-6 py-3">
                  Merged
                </th>
                <th>
                  <div className="flex justify-center gap-2">
                    <button onClick={() => setSelectMergeMode((prev) => !prev)}>
                      toggle merge
                    </button>
                    {isSelectMergeMode && (
                      <button
                        onClick={() => handleMerge(selectedMerged)}
                        disabled={!selectedMerged.length}
                        className="disabled:cursor-not-allowed disabled:hover:border-transparent disabled:bg-gray-400 disabled:text-gray-500"
                      >
                        merge
                      </button>
                    )}
                  </div>
                </th>
              </tr>
            </thead>
            <tbody>
              {mergeds.map((item, idx) => (
                <tr
                  id={`row-merged-${item.mergedIndex}`}
                  className={`border-b  border-gray-700 ${
                    mergeHightlights.includes(item.mergedIndex) ||
                    item.mergedIndex === tlIndex
                      ? "bg-gray-600"
                      : "bg-gray-800"
                  }`}
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
                                      handleSelectUnmerged(
                                        i.originalIndex,
                                        group
                                      )
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
                                className="text-xs"
                              >
                                cancel
                              </button>
                              <button
                                onClick={() => {
                                  if (
                                    selectedUnmerged.length < item.mergedLength
                                  )
                                    setSelectedUnmerged(
                                      mergeds
                                        .slice(idx, idx + item.mergedLength)
                                        .map((g) => g.originalIndex)
                                    );
                                  else setSelectedUnmerged([]);
                                }}
                                className="text-xs"
                              >
                                {selectedUnmerged.length < item.mergedLength
                                  ? "select"
                                  : "unselect"}{" "}
                                all
                              </button>
                              <button
                                onClick={() =>
                                  handleUnmerge(
                                    selectedUnmerged,
                                    item.mergedIndex
                                  )
                                }
                                disabled={!selectedUnmerged.length}
                                className="disabled:cursor-not-allowed disabled:hover:border-transparent disabled:bg-gray-400 disabled:text-gray-500 text-xs"
                              >
                                unmerge
                              </button>
                            </div>
                          </>
                        ) : (
                          <div className="flex items-center gap-4 group">
                            {mergeds
                              .slice(idx, idx + mergeds[idx].mergedLength)
                              .map((item) => item.text)
                              .join("")}
                            <PlayCircleIcon
                              className="h-6 w-6 hidden group-hover:block cursor-pointer"
                              onClick={() => {
                                if (intervalRef.current) {
                                  clearTimeout(intervalRef.current);
                                }
                                intervalRef.current = null;
                                setCurrentTime(item.start);
                                setTlIndex(item.mergedIndex);
                                videoRef.current?.seekTo(item.start);
                                setPlaying(true);
                                intervalRef.current = setTimeout(
                                  () => handleNextTl(item.mergedIndex + 1),
                                  (item.end - item.start) * 1000
                                );
                              }}
                            />
                          </div>
                        )}
                      </td>
                      <td
                        className="px-6 py-4"
                        rowSpan={mergeds[idx].mergedLength}
                      >
                        <div className="flex flex-col justify-center items-center gap-2">
                          {isSelectMergeMode ? (
                            <input
                              type="checkbox"
                              checked={selectedMerged.includes(
                                mergeds[idx].mergedIndex
                              )}
                              onChange={() =>
                                handleSelectMerged(mergeds[idx].mergedIndex)
                              }
                            />
                          ) : (
                            <button
                              aab-shortcut="jk"
                              onMouseEnter={() =>
                                handleHightlight(item.originalIndex)
                              }
                              onMouseLeave={() => setMergeHightlights([])}
                              onFocus={() =>
                                handleHightlight(item.originalIndex)
                              }
                              onBlur={() => setMergeHightlights([])}
                              disabled={idx == 0}
                              className="disabled:cursor-not-allowed disabled:hover:border-transparent disabled:bg-gray-400 disabled:text-gray-500 text-xs"
                              onClick={() => {
                                toggleVideo(true);
                                setPlaying(false);
                                setCurrentTime(mergeds[idx - 1].start);
                                setTlIndex(mergeds[idx - 1].mergedIndex);
                                handleMerge(mergeHightlights);
                              }}
                            >
                              merge with above
                            </button>
                          )}
                          {item.mergedLength > 1 && (
                            <button
                              aab-shortcut="jk"
                              className="text-xs"
                              onClick={() =>
                                handleUnmerge(
                                  mergeds
                                    .slice(idx, idx + item.mergedLength)
                                    .map((g) => g.originalIndex),
                                  item.mergedIndex
                                )
                              }
                            >
                              unmerge
                            </button>
                          )}
                        </div>
                      </td>
                    </>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}

export default App;
