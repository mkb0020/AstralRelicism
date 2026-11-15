export const loadJSON = async url => {
  const r = await fetch(url, { cache: 'no-cache' });
  if (!r.ok) throw new Error(`could not load ${url} (${r.status})`);
  return r.json();
};
// decode() up front: otherwise a sheet is decoded the first time it is drawn (a hitch on the first run / jump)
export const loadImage = src => new Promise((res, rej) => {
  const im = new Image();
  im.onload = () => im.decode().catch(() => {}).then(() => res(im));
  im.onerror = () => rej(new Error('could not load ' + src));
  im.src = src;
});
