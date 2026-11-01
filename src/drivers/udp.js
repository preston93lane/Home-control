import dgram from 'node:dgram';

// Send a JSON datagram and (optionally) wait for the first reply from the same host.
export function udpRequest({ host, port, message, expectReply = true, timeoutMs = 1500 }) {
  return new Promise((resolve, reject) => {
    const sock = dgram.createSocket('udp4');
    const payload = Buffer.from(typeof message === 'string' ? message : JSON.stringify(message));
    let timer;
    const done = (err, value) => {
      clearTimeout(timer);
      sock.close();
      err ? reject(err) : resolve(value);
    };
    sock.on('error', (err) => done(err));
    sock.on('message', (buf, rinfo) => {
      if (rinfo.address !== host) return;
      try {
        done(null, JSON.parse(buf.toString()));
      } catch (e) {
        done(new Error(`Bad reply from ${host}: ${buf.toString().slice(0, 100)}`));
      }
    });
    sock.send(payload, port, host, (err) => {
      if (err) return done(err);
      if (!expectReply) return done(null, null);
      timer = setTimeout(() => done(new Error(`No reply from ${host}:${port} within ${timeoutMs}ms`)), timeoutMs);
    });
  });
}
