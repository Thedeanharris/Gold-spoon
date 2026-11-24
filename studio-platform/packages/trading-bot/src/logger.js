export function createJsonLogger(write = (line) => console.log(line)) {
  return (event, details = {}) => write(JSON.stringify({ timestamp: new Date().toISOString(), event, ...details }));
}
