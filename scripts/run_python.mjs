// Resolves whichever Python launcher this machine actually has, then runs the
// given scripts in order. Windows installs often expose only `py`, while macOS
// and Linux usually expose only `python3`.
import { spawnSync } from "node:child_process";

const CANDIDATES = process.platform === "win32"
  ? ["py", "python", "python3"]
  : ["python3", "python"];

const launcher = CANDIDATES.find((cmd) => {
  const probe = spawnSync(cmd, ["--version"], { stdio: "ignore", shell: false });
  return probe.status === 0;
});

if (!launcher) {
  console.error(
    `找不到 Python。請安裝 Python >= 3.10，或確認 ${CANDIDATES.join(" / ")} 其中之一在 PATH 中。`,
  );
  process.exit(1);
}

for (const script of process.argv.slice(2)) {
  const result = spawnSync(launcher, ["-X", "utf8", script], {
    stdio: "inherit",
    shell: false,
  });
  if (result.status !== 0) process.exit(result.status ?? 1);
}
