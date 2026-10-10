// SPDX-License-Identifier: Apache-2.0
export function normalizeTitle(value) {
  if(typeof value!=='string') throw new TypeError('Title must be a string');
  const title=value.trim();
  if([...title].length<1||[...title].length>200) throw new RangeError('Title must contain 1 to 200 characters');
  return title;
}
export function assertTrustedFrame(senderFrame,mainFrame) {
  if(!senderFrame||senderFrame!==mainFrame) throw new Error('Untrusted IPC frame');
}
