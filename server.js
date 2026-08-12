const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);

const PORT = process.env.PORT || 10000;

app.use(express.static(__dirname));

// 데이터 구조 정의
const rooms = {};      // 방 정보 저장
const userRooms = {};  // socket.id -> roomCode 매핑

// 제시어 목록
const WORDS = ['사과', '바나나', '호랑이', '비행기', '자동차', '컴퓨터', '스마트폰', '피자', '축구', '자전거', '선글라스', '아이스크림', '시계', '냉장고'];

function getRandomWord() {
    return WORDS[Math.floor(Math.random() * WORDS.length)];
}

function generateRoomCode() {
    return Math.random().toString(36).substring(2, 8).toUpperCase();
}

function handleLeaveRoom(socket) {
    const roomCode = userRooms[socket.id];
    if (!roomCode) return;

    const room = rooms[roomCode];
    if (room) {
        const index = room.players.findIndex(p => p.id === socket.id);
        if (index !== -1) {
            const disconnectedPlayer = room.players.splice(index, 1)[0];
            socket.leave(roomCode);
            io.to(roomCode).emit('chatMessage', { system: true, text: `${disconnectedPlayer.nickname}님이 퇴장하셨습니다.` });

            if (room.players.length === 0) {
                if (room.timer) clearInterval(room.timer);
                delete rooms[roomCode];
            } else {
                if (room.hostId === socket.id) room.hostId = room.players[0].id; // 방장 자동 위임
                io.to(roomCode).emit('updatePlayers', { players: room.players, hostId: room.hostId });
            }
        }
    }
    delete userRooms[socket.id];
}

io.on('connection', (socket) => {
    // 1. 방 만들기
    socket.on('createRoom', ({ userNick }) => {
        const roomCode = generateRoomCode();
        rooms[roomCode] = {
            hostId: socket.id,
            players: [{ id: socket.id, nickname: userNick, score: 0 }],
            isPlaying: false,
            currentWord: '',
            drawerId: null,
            drawerIndex: -1,
            timer: null
        };
        userRooms[socket.id] = roomCode;
        socket.join(roomCode);

        socket.emit('joinSuccess', { roomCode, isHost: true });
        io.to(roomCode).emit('updatePlayers', { players: rooms[roomCode].players, hostId: rooms[roomCode].hostId });
        io.to(roomCode).emit('chatMessage', { system: true, text: `${userNick}님이 방을 생성했습니다.` });
    });

    // 2. 방 참가하기
    socket.on('joinRoom', ({ roomCode, userNick }) => {
        const code = roomCode.toUpperCase();
        const room = rooms[code];

        if (!room) return socket.emit('errorMessage', '존재하지 않는 방 코드입니다.');
        if (room.players.length >= 8) return socket.emit('errorMessage', '방이 가득 찼습니다.');

        room.players.push({ id: socket.id, nickname: userNick, score: 0 });
        userRooms[socket.id] = code;
        socket.join(code);

        socket.emit('joinSuccess', { roomCode: code, isHost: false });
        io.to(code).emit('updatePlayers', { players: room.players, hostId: room.hostId });
        io.to(code).emit('chatMessage', { system: true, text: `${userNick}님이 입장했습니다.` });
    });

    // 3. 게임 시작
    socket.on('startGame', () => {
        const roomCode = userRooms[socket.id];
        const room = rooms[roomCode];

        if (!room) return;
        if (room.hostId !== socket.id) return socket.emit('errorMessage', '방장만 게임을 시작할 수 있습니다.');
        if (room.players.length < 2) return socket.emit('errorMessage', '최소 2명 이상 모여야 게임을 시작할 수 있습니다.');
        if (room.isPlaying) return socket.emit('errorMessage', '이미 게임이 진행 중입니다.');

        room.isPlaying = true;
        room.drawerIndex = -1;
        startNextTurn(roomCode);
    });

    function startNextTurn(roomCode) {
        const room = rooms[roomCode];
        if (!room || room.players.length === 0) return;

        room.drawerIndex = (room.drawerIndex + 1) % room.players.length;
        const drawer = room.players[room.drawerIndex];
        room.drawerId = drawer.id;
        room.currentWord = getRandomWord();

        room.players.forEach(p => p.isDrawing = (p.id === drawer.id));
        io.to(roomCode).emit('updatePlayers', { players: room.players, hostId: room.hostId });

        const maskWord = '? '.repeat(room.currentWord.length).trim();
        io.to(roomCode).emit('turnStart', { drawerId: drawer.id, hintMask: `제시어: ${maskWord}` });
        io.to(drawer.id).emit('yourWord', room.currentWord);

        let timeLeft = 60;
        io.to(roomCode).emit('timerUpdate', timeLeft);

        if (room.timer) clearInterval(room.timer);
        room.timer = setInterval(() => {
            timeLeft--;
            io.to(roomCode).emit('timerUpdate', timeLeft);

            if (timeLeft <= 0) {
                clearInterval(room.timer);
                io.to(roomCode).emit('chatMessage', { system: true, text: `시간 종료! 정답은 [ ${room.currentWord} ] 이었습니다.` });
                setTimeout(() => startNextTurn(roomCode), 3000);
            }
        }, 1000);
    }

    // 4. 그림 그리기 연동
    socket.on('draw', (data) => {
        const roomCode = userRooms[socket.id];
        if (roomCode) socket.to(roomCode).emit('draw', data);
    });

    socket.on('syncCanvasHistory', (action) => {
        const roomCode = userRooms[socket.id];
        if (roomCode) socket.to(roomCode).emit('syncCanvasHistory', action);
    });

    socket.on('clearCanvas', () => {
        const roomCode = userRooms[socket.id];
        if (roomCode) io.to(roomCode).emit('clearCanvas');
    });

    // 5. 채팅 및 정답 판정
    socket.on('sendMessage', (msg) => {
        const roomCode = userRooms[socket.id];
        const room = rooms[roomCode];

        if (!room || !msg.trim()) return;
        const player = room.players.find(p => p.id === socket.id);
        if (!player) return;

        if (room.isPlaying && room.currentWord) {
            if (msg.trim().toLowerCase() === room.currentWord.toLowerCase()) {
                if (socket.id === room.drawerId) return;

                player.score += 100;
                clearInterval(room.timer);

                io.to(roomCode).emit('correctAnswer', { winnerNick: player.nickname, word: room.currentWord });
                io.to(roomCode).emit('updatePlayers', { players: room.players, hostId: room.hostId });

                setTimeout(() => startNextTurn(roomCode), 2500);
                return;
            }
        }

        io.to(roomCode).emit('chatMessage', { nickname: player.nickname, text: msg, system: false });
    });

    // 6. 방 나가기 및 퇴장 처리
    socket.on('leaveRoom', () => {
        handleLeaveRoom(socket);
    });

    socket.on('disconnect', () => {
        handleLeaveRoom(socket);
    });
});

http.listen(PORT, () => {
    console.log(`Draw, Guess 서버 실행 중: ${PORT}`);
});
