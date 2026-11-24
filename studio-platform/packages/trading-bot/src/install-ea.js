import { spawnSync } from "node:child_process";
import { access, copyFile, mkdir, readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const sourcePath = fileURLToPath(new URL("../mt5/GoldSpoonAPlus.mq5", import.meta.url));

async function exists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

export async function installMt5Expert(adapter, { compile = true } = {}) {
  const paths = await adapter.getTerminalPaths();
  if (typeof paths?.dataPath !== "string" || typeof paths?.installPath !== "string") {
    throw new Error("MT5 adapter did not return valid terminal paths");
  }
  const expertsPath = join(paths.dataPath, "MQL5", "Experts", "Gold Spoon");
  const destination = join(expertsPath, "GoldSpoonAPlus.mq5");
  await mkdir(expertsPath, { recursive: true });

  if (await exists(destination)) {
    const [existing, source] = await Promise.all([readFile(destination), readFile(sourcePath)]);
    if (!existing.equals(source)) {
      throw new Error(`Refusing to overwrite an existing EA file: ${destination}`);
    }
  } else {
    await copyFile(sourcePath, destination);
  }

  if (!compile) return { sourcePath: destination, compiled: false };
  const executablePath = destination.replace(/\.mq5$/i, ".ex5");
  if (await exists(executablePath)) {
    const [sourceInfo, executableInfo] = await Promise.all([stat(destination), stat(executablePath)]);
    if (executableInfo.mtimeMs > sourceInfo.mtimeMs) {
      return { sourcePath: destination, compiled: true, executablePath, note: "The existing EA executable is newer than its source." };
    }
  }

  let compilerPath = "";
  for (const candidate of [join(paths.installPath, "metaeditor64.exe"), join(paths.installPath, "metaeditor.exe")]) {
    if (await exists(candidate)) {
      compilerPath = candidate;
      break;
    }
  }
  if (!compilerPath) {
    return { sourcePath: destination, compiled: false, note: "MetaEditor compiler was not found beside the MT5 terminal" };
  }

  const compileLog = join(expertsPath, "GoldSpoonAPlus.compile.log");
  const result = spawnSync(compilerPath, [`/compile:"${destination}"`, `/log:"${compileLog}"`], {
    encoding: "utf8",
    windowsHide: true,
    timeout: 120000,
  });
  if (result.error) {
    throw new Error(`MetaEditor could not compile the EA: ${result.error.message}`);
  }
  let log = "";
  try {
    log = await readFile(compileLog, "utf8");
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  let executableIsCurrent = false;
  if (result.status === 0 && await exists(executablePath)) {
    const [sourceInfo, executableInfo] = await Promise.all([stat(destination), stat(executablePath)]);
    executableIsCurrent = executableInfo.mtimeMs > sourceInfo.mtimeMs;
  }
  if (result.status !== 0 || (!/0 errors/i.test(log) && !executableIsCurrent)) {
    const output = [result.stdout, result.stderr].filter(Boolean).join("\n").trim();
    throw new Error(`MetaEditor did not report a clean EA compile (exit ${result.status}). Log: ${log.trim() || "not created"}. Output: ${output || "none"}. Review ${compileLog}`);
  }
  return {
    sourcePath: destination,
    compiled: true,
    ...(log ? { compileLog } : { note: "MetaEditor produced a current EA executable without a compile log." }),
    executablePath,
  };
}
