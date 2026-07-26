socket.on("connect", () => {
  socket.emit("join:request");
});
