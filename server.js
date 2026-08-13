const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);

const PORT = process.env.PORT || 10000;

app.use(express.static(__dirname));

const rooms = {};
const userRooms = {};

// 📚 제시어 목록 (총 500+ 단어)
const WORDS = [
    // 🐾 동물 & 곤충
    '호랑이', '사자', '기린', '코끼리', '얼룩말', '펭귄', '돌고래', '상어', '문어', '오징어',
    '다람쥐', '토끼', '강아지', '고양이', '햄스터', '판다', '캥거루', '독수리', '올빼미', '비둘기',
    '카멜레온', '공룡', '플라밍고', '하마', '악어', '코뿔소', '사슴', '늑대', '여우', '북극곰',
    '표범', '치타', '낙타', '고릴라', '침팬지', '원숭이', '너구리', '스컹크', '고슴도치', '물개',
    '바다표범', '바다코끼리', '고래', '가오리', '해마', '해파리', '게', '소라게', '거북이', '카피바라',
    '나무늘보', '알파카', '타조', '공작', '수리부엉이', '제비', '까마귀', '참새', '병아리', '닭',
    '오리', '거위', '백조', '개구리', '맹꽁이', '도롱뇽', '뱀', '지렁이', '달팽이', '장수풍뎅이',

    // 🍎 음식, 디저트 & 음료
    '사과', '바나나', '포도', '수박', '딸기', '파인애플', '복숭아', '아보카도', '체리', '망고',
    '피자', '햄버거', '치킨', '떡볶이', '라면', '초밥', '파스타', '스테이크', '자장면', '탕수육',
    '아이스크림', '도넛', '마카롱', '케이크', '붕어빵', '감자튀김', '핫도그', '팝콘', '샌드위치', '계란후라이',
    '김밥', '순대', '튀김', '어묵', '족발', '보쌈', '삼겹살', '갈비탕', '비빔밥', '볶음밥',
    '부대찌개', '김치찌개', '된장찌개', '돈까스', '우동', '메밀소바', '샤브샤브', '타코야끼', '오코노미야끼', '훠궈',
    '양꼬치', '만두', '찐빵', '호떡', '달고나', '팥빙수', '와플', '크레페', '에그타르트', '치즈케이크',
    '초콜릿', '사탕', '젤리', '쿠키', '식빵', '크루아상', '소금빵', '바게트', '아메리카노', '카페라떼',
    '버블티', '스무디', '에이드', '콜라', '사이다', '우유', '두유', '오렌지주스', '식혜', '수정과',

    // 🛋️ 사물, 가전 & 소품
    '컴퓨터', '스마트폰', '노트북', '헤드폰', '마우스', '키보드', '냉장고', '세탁기', '선풍기', '에어컨',
    '청소기', '전자레인지', '드라이기', '시계', '거울', '우산', '안경', '선글라스', '지갑', '열쇠',
    '가방', '모자', '신발', '양말', '장갑', '지우개', '연필', '가위', '자물쇠', '볼펜',
    '형광펜', '자', '칼', '풀', '테이프', '스테이플러', '공책', '스케치북', '색연필', '물감',
    '붓', '돋보기', '망원경', '카메라', '삼각대', '마이크', '스피커', '보조배터리', '충전기', 'USB',
    '티비', '빔프로젝터', '로봇청소기', '공기청정기', '가습기', '제습기', '에어프라이어', '토스터', '커피포트', '식기세척기',
    '침대', '소파', '책상', '의자', '옷장', '책장', '화장대', '베개', '이불', '스탠드',
    '화분', '액자', '휴지', '물티슈', '빗', '면도기', '칫솔', '치약', '비누', '샴푸',

    // 🚗 교통수단 & 시설
    '자동차', '비행기', '헬리콥터', '기차', '지하철', '자전거', '킥보드', '오토바이', '버스', '택시',
    '소방차', '경찰차', '구급차', '포크레인', '잠수함', '열기구', '우주선', '요트', '트럭', '케이블카',
    '경전철', 'KTX', '모노레일', '인력거', '마차', '세그웨이', '스케이트보드', '롤러스케이트', '썰매', '스노우모빌',
    '경비정', '항공모함', '유람선', '나룻배', '카누', '카약', '정류장', '신호등', '횡단보도', '이정표',
    '가로등', '주차장', '주유소', '고속도로', '터널', '다리', '선착장', '공항', '기차역', '지하철역',

    // 🏫 장소 & 건물
    '학교', '병원', '경찰서', '소방서', '은행', '도서관', '공항', '놀이공원', '영화관', '수영장',
    '우체국', '박물관', '미술관', '식물원', '동물원', '수족관', '경기장', '체육관', '헬스장', '목욕탕',
    '찜질방', '미용실', '백화점', '대형마트', '편의점', '약국', '카페', '레스토랑', '빵집', '꽃집',
    '문구점', '서점', '장난감가게', '주유소', '카센터', '호텔', '펜션', '캠핑장', '전망대', '등대',
    '풍차', '성', '궁전', '피라미드', '신전', '한옥', '초가집', '굴뚝', '아파트', '빌라',

    // 🌍 자연, 날씨 & 우주
    '태양', '달', '지구', '무지개', '번개', '화산', '폭포', '바다', '빙산', '사막',
    '구름', '비', '눈', '우박', '안개', '태풍', '토네이도', '지진', '오로라', '노을',
    '수성', '금성', '화성', '목성', '토성', '천왕성', '해왕성', '혜성', '유성', '블랙홀',
    '은하수', '인공위성', '산', '계곡', '동굴', '섬', '반도', '정글', '초원', '늪',
    '호수', '강', '파도', '갯벌', '단풍', '낙엽', '새싹', '꽃밭', '자갈', '바위',

    // 👨‍🍳 직업, 인물 & 캐릭터
    '의사', '경찰관', '소방관', '요리사', '화가', '가수', '우주비행사', '마술사', '탐정', '해적',
    '공주', '왕자', '로봇', '외계인', '유령', '산타클로스', '닌자', '상인', '농부', '판사',
    '간호사', '수의사', '약사', '치과의사', '변호사', '검사', '선생님', '교수', '과학자', '발명가',
    '프로그래머', '사진작가', '건축가', '디자이너', '비행기기장', '승무원', '군인', '해녀', '광부', '어부',
    '운동선수', '발레리나', '피아니스트', '지휘자', '배우', '성우', '모델', '마임배우', '광대', '킹콩',

    // ⚽ 스포츠, 취미 & 악기
    '축구', '농구', '야구', '테니스', '골프', '볼링', '수영', '스케이트보드', '태권도', '양궁',
    '피아노', '기타', '드럼', '바이올린', '체스', '낚시', '캠핑', '등산', '사진', '스노클링',
    '배드민턴', '탁구', '족구', '배구', '핸드볼', '럭비', '아이스타키', '피겨스케이팅', '쇼트트랙', '스키',
    '스노우보드', '서핑', '클라이밍', '패러글라이딩', '마라톤', '펜싱', '유도', '씨름', '복싱', '승마',
    '첼로', '플루트', '색소폰', '트럼펫', '아코디언', '하프', '우쿨렐레', '실로폰', '소고', '장구',

    // 🎨 문화, 상징 & 기타
    '왕관', '보물상자', '트로피', '메달', '풍선', '폭죽', '선물상자', '촛불', '크리스마스트리', '잭오랜턴',
    '하트', '클로버', '평화기호', '해골', '미라', '흡혈귀', '구미호', '도깨비', '인어', '천사',
    '악마', '마법사', '마법지팡이', '유리구두', '타임머신', '보물지도', '나침반', '황금', '다이아몬드', '여권'
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

                // 🌟 게임 진행 중일 때 퇴장 처리
                if (room.isPlaying) {
                    if (room.players.length <= 1) {
                        if (room.timer) {
                            clearInterval(room.timer);
                            room.timer = null;
                        }
                        
                        room.isPlaying = false;
                        room.drawerId = null;
                        room.currentWord = '';
                        room.isRoundOver = false;

                        room.players.forEach(p => p.isDrawing = false);

                        io.to(roomCode).emit('chatMessage', { 
                            system: true, 
                            text: '⚠️ 인원이 부족하여 게임이 중단되었습니다. (최소 2명 필요)' 
                        });

                        io.to(roomCode).emit('turnStart', { drawerId: null, hintMask: '대기 중...' });
                        io.to(roomCode).emit('clearCanvas');
                        io.to(roomCode).emit('timerUpdate', 0);
                    } else if (disconnectedPlayer.id === room.drawerId) {
                        if (room.timer) clearInterval(room.timer);
                        
                        io.to(roomCode).emit('chatMessage', { 
                            system: true, 
                            text: '🎨 출제자가 퇴장하여 다음 턴으로 넘어갑니다.' 
                        });
                        
                        room.drawerIndex = (room.drawerIndex - 1 + room.players.length) % room.players.length;
                        startNextTurn(roomCode);
                    }
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
            timeLeft: 60,
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

    // ⏳ 방장이 게임 시작 버튼을 눌렀을 때 카운트다운 요청 처리
    socket.on('requestCountdown', () => {
        const roomCode = userRooms[socket.id];
        const room = rooms[roomCode];

        if (!room) return;
        if (room.hostId !== socket.id) return socket.emit('errorMessage', '방장만 게임을 시작할 수 있습니다.');
        if (room.players.length < 2) return socket.emit('errorMessage', '최소 2명 이상 모여야 게임을 시작할 수 있습니다.');
        if (room.isPlaying) return socket.emit('errorMessage', '이미 게임이 진행 중입니다.');

        // 방 전체에 카운트다운 시작 신호 브로드캐스트
        io.to(roomCode).emit('startCountdown');
    });

    socket.on('startGame', () => {
        const roomCode = userRooms[socket.id];
        const room = rooms[roomCode];

        if (!room) return;
        if (room.hostId !== socket.id) return;
        if (room.isPlaying) return;

        room.isPlaying = true;
        room.drawerIndex = -1;
        room.usedWords = [];
        startNextTurn(roomCode);
    });

    function startNextTurn(roomCode) {
        const room = rooms[roomCode];
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

                const earnedScore = Math.max(20, Math.floor((room.timeLeft / 60) * 100));
                player.score += earnedScore;

                const drawer = room.players.find(p => p.id === room.drawerId);
                if (drawer) drawer.score += 30;

                clearInterval(room.timer);

                io.to(roomCode).emit('correctAnswer', { 
                    winnerNick: player.nickname, 
                    word: room.currentWord,
                    score: earnedScore 
                });
                io.to(roomCode).emit('updatePlayers', { players: room.players, hostId: room.hostId });

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
