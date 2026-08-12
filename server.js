const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);

const PORT = process.env.PORT || 10000;

app.use(express.static(__dirname));

const rooms = {};
const userRooms = {};

// 제시어 목록
const WORDS = [
    // 동물 & 식물
    '호랑이', '사자', '기린', '코끼리', '얼룩말', '펭귄', '돌고래', '상어', '문어', '오징어',
    '다람쥐', '토끼', '강아지', '고양이', '햄스터', '판다', '캥거루', '독수리', '올빼미', '비둘기',
    '카멜레온', '공룡', '플라밍고', '선인장', '해바라기', '장미', '단풍잎', '대나무', '버섯', '바오밥나무',
    
    // 음식 & 디저트
    '사과', '바나나', '포도', '수박', '딸기', '파인애플', '복숭아', '아보카도', '체리', '망고',
    '피자', '햄버거', '치킨', '떡볶이', '라면', '초밥', '파스타', '스테이크', '자장면', '탕수육',
    '아이스크림', '도넛', '마카롱', '케이크', '붕어빵', '감자튀김', '핫도그', '팝콘', '샌드위치', '계란후라이',
    
    // 사물 & 가전제품
    '컴퓨터', '스마트폰', '노트북', '헤드폰', '마우스', '키보드', '냉장고', '세탁기', '선풍기',
    '에어컨', '청소기', '전자레인지', '드라이기', '시계', '거울', '우산', '안경', '선글라스', '지갑',
    '열쇠', '가방', '모자', '신발', '양말', '장갑', '지우개', '연필', '가위', '자물쇠',
    
    // 교통수단 & 시설
    '자동차', '비행기', '헬리콥터', '기차', '지하철', '자전거', '킥보드', '오토바이', '버릇', '택시',
    '소방차', '경찰차', '구급차', '포크레인', '잠수함', '열기구', '우주선', '요트', '트럭', '케이블카',
    
    // 장소 & 자연
    '학교', '병원', '경찰서', '소방서', '은행', '도서관', '공항', '놀이공원', '영화관', '수영장',
    '태양', '달', '지구', '무지개', '번개', '화산', '폭포', '바다', '빙산', '사막',
    
    // 직업 & 인물
    '의사', '경찰관', '소방관', '요리사', '화가', '가수', '우주비행사', '마술사', '탐정', '해적',
    '공주', '왕자', '로봇', '외계인', '유령', '산타클로스', '닌자', '상인', '농부', '판사',
    
    // 스포츠 & 취미
    '축구', '농구', '야구', '테니스', '골프', '볼링', '수영', '스케이트보드', '태권도', '양궁',
    '피아노', '기타', '드럼', '바이올린', '체스', '낚시', '캠핑', '등산', '사진', '스노클링'
];

function getRandomWord(room) {
    if (!room.usedWords) room.usedWords = [];
    
    let availableWords = WORDS.filter(w => !room.usedWords.includes(w));
    if (availableWords.length === 0) {
        room.usedWords = [];
        availableWords = [...WORDS];
    }

    const selectedWord = availableWords[Math.floor(Math.random() * availableWords.length)];
    room.usedWords.push(selectedWord);
    return selectedWord;
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
                if (room.hostId === socket.id) room.hostId = room.players[0].id;

                // 🌟 게임 진행 중 인원이 1명 이하가 되면 대기 상태로 전환
                if (room.isPlaying && room.players.length <= 1) {
                    if (room.timer) {
                        clearInterval(room.timer);
                        room.timer = null;
                    }
                    
                    room.isPlaying = false;
                    room.drawerId = null;
                    room.currentWord = '';
                    room.isRoundOver = false;

                    // 플레이어 그리너(isDrawing) 상태 해제
                    room.players.forEach(p => p.isDrawing = false);

                    // 중단 메시지 전송
                    io.to(roomCode).emit('chatMessage', { 
                        system: true, 
                        text: '⚠️ 인원이 부족하여 게임이 중단되었습니다. (최소 2명 필요)' 
                    });

                    // 화면 상태 및 타이머 초기화 알림
                    io.to(roomCode).emit('turnStart', { drawerId: null, hintMask: '대기 중...' });
                    io.to(roomCode).emit('clearCanvas');
                    io.to(roomCode).emit('timerUpdate', 0);
                }

                io.to(roomCode).emit('updatePlayers', { players: room.players, hostId: room.hostId });
            }
        }
    }
    delete userRooms[socket.id];
}

io.on('connection', (socket) => {
    socket.on('createRoom', ({ userNick }) => {
        const roomCode = generateRoomCode();
        rooms[roomCode] = {
            hostId: socket.id,
            players: [{ id: socket.id, nickname: userNick, score: 0 }],
            isPlaying: false,
            currentWord: '',
            drawerId: null,
            drawerIndex: -1,
            timer: null,
            timeLeft: 60, // 남은 시간 기록용 변수 추가
            usedWords: [],
            isRoundOver: false
        };
        userRooms[socket.id] = roomCode;
        socket.join(roomCode);

        socket.emit('joinSuccess', { roomCode, isHost: true });
        io.to(roomCode).emit('updatePlayers', { players: rooms[roomCode].players, hostId: rooms[roomCode].hostId });
        io.to(roomCode).emit('chatMessage', { system: true, text: `${userNick}님이 방을 생성했습니다.` });
    });

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

    socket.on('startGame', () => {
        const roomCode = userRooms[socket.id];
        const room = rooms[roomCode];

        if (!room) return;
        if (room.hostId !== socket.id) return socket.emit('errorMessage', '방장만 게임을 시작할 수 있습니다.');
        if (room.players.length < 2) return socket.emit('errorMessage', '최소 2명 이상 모여야 게임을 시작할 수 있습니다.');
        if (room.isPlaying) return socket.emit('errorMessage', '이미 게임이 진행 중입니다.');

        room.isPlaying = true;
        room.drawerIndex = -1;
        room.usedWords = [];
        startNextTurn(roomCode);
    });

    function startNextTurn(roomCode) {
        const room = rooms[roomCode];
        // 🌟 진행 중이 아니거나 인원이 부족하면 턴을 시작하지 않음
        if (!room || !room.isPlaying || room.players.length < 2) return;

        room.isRoundOver = false;
        room.drawerIndex = (room.drawerIndex + 1) % room.players.length;
        const drawer = room.players[room.drawerIndex];
        room.drawerId = drawer.id;
        room.currentWord = getRandomWord(room);

        room.players.forEach(p => p.isDrawing = (p.id === drawer.id));
        io.to(roomCode).emit('updatePlayers', { players: room.players, hostId: room.hostId });

        const maskWord = '_ '.repeat(room.currentWord.length).trim();
        io.to(roomCode).emit('turnStart', { drawerId: drawer.id, hintMask: `제시어: ${maskWord}` });
        io.to(drawer.id).emit('yourWord', room.currentWord);

        room.timeLeft = 60;
        io.to(roomCode).emit('timerUpdate', room.timeLeft);

        if (room.timer) clearInterval(room.timer);
        room.timer = setInterval(() => {
            room.timeLeft--;
            io.to(roomCode).emit('timerUpdate', room.timeLeft);

            if (room.timeLeft <= 0) {
                clearInterval(room.timer);
                room.isRoundOver = true;
                io.to(roomCode).emit('chatMessage', { system: true, text: `시간 종료! 정답은 [ ${room.currentWord} ] 이었습니다.` });
                
                // 3초 후 다음 턴으로 넘어가기 전 인원 체크
                setTimeout(() => {
                    if (room.isPlaying) startNextTurn(roomCode);
                }, 3000);
            }
        }, 1000);
    }

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

    socket.on('sendMessage', (msg) => {
        const roomCode = userRooms[socket.id];
        const room = rooms[roomCode];

        if (!room || !msg.trim()) return;
        const player = room.players.find(p => p.id === socket.id);
        if (!player) return;

        if (room.isPlaying && room.currentWord) {
            if (msg.trim().toLowerCase() === room.currentWord.toLowerCase()) {
                if (socket.id === room.drawerId) return;
                if (room.isRoundOver) return;

                room.isRoundOver = true;

                // ⚡ [시간 차등 점수 계산 로직] (최소 20점 ~ 최대 100점)
                const earnedScore = Math.max(20, Math.floor((room.timeLeft / 60) * 100));
                player.score += earnedScore;

                // 🎨 그림을 그린 사람에게도 수고 보너스 점수 부여 (+30pt)
                const drawer = room.players.find(p => p.id === room.drawerId);
                if (drawer) drawer.score += 30;

                clearInterval(room.timer);

                // 클라이언트에 획득 점수 정보를 포함하여 전송
                io.to(roomCode).emit('correctAnswer', { 
                    winnerNick: player.nickname, 
                    word: room.currentWord,
                    score: earnedScore 
                });
                io.to(roomCode).emit('updatePlayers', { players: room.players, hostId: room.hostId });

                // 정답 맞춘 후 2.5초 뒤 인원 체크
                setTimeout(() => {
                    if (room.isPlaying) startNextTurn(roomCode);
                }, 2500);
                return;
            }
        }

        io.to(roomCode).emit('chatMessage', { nickname: player.nickname, text: msg, system: false });
    });

    socket.on('leaveRoom', () => { handleLeaveRoom(socket); });
    socket.on('disconnect', () => { handleLeaveRoom(socket); });
});

http.listen(PORT, () => {
    console.log(`Draw, Guess 서버 실행 중: ${PORT}`);
});
