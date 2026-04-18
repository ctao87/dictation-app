// 单词听写应用 - 使用有道API
class DictationApp {
    constructor() {
        this.batches = [];
        this.nextBatchId = 1;
        this.currentDictation = null;
        this.currentAccent = 'US';
        this.isPaused = false;

        this.init();
    }

    init() {
        this.loadData();
        this.bindEvents();
        this.updateBatchIndicator();
        this.renderBatchList();
        this.preloadVoices();
    }

    preloadVoices() {
        if ('speechSynthesis' in window) {
            speechSynthesis.getVoices();
            speechSynthesis.onvoiceschanged = () => speechSynthesis.getVoices();
        }
    }

    loadData() {
        const data = localStorage.getItem('dictationData');
        if (data) {
            try {
                const parsed = JSON.parse(data);
                this.batches = parsed.batches || [];
                this.nextBatchId = parsed.nextBatchId || 1;
            } catch (e) {
                console.error('Load data error:', e);
            }
        }
    }

    saveData() {
        localStorage.setItem('dictationData', JSON.stringify({
            batches: this.batches,
            nextBatchId: this.nextBatchId
        }));
    }

    bindEvents() {
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.addEventListener('click', (e) => this.switchTab(e.target.dataset.tab));
        });

        document.getElementById('add-words-btn').addEventListener('click', () => this.previewWords());
        document.getElementById('confirm-batch-btn').addEventListener('click', () => this.confirmBatch());
        document.getElementById('cancel-batch-btn').addEventListener('click', () => this.cancelPreview());

        document.getElementById('import-btn').addEventListener('click', () => document.getElementById('import-file').click());
        document.getElementById('import-file').addEventListener('change', (e) => this.importData(e));
        document.getElementById('export-btn').addEventListener('click', () => this.exportData());
        document.getElementById('clear-btn').addEventListener('click', () => this.clearAll());

        document.getElementById('batch-numbers').addEventListener('input', (e) => this.parseBatchNumbers(e.target.value));

        document.getElementById('speech-rate').addEventListener('input', (e) => {
            document.getElementById('rate-value').textContent = e.target.value + 'x';
        });
        document.getElementById('start-dictation-btn').addEventListener('click', () => this.startDictation());

        document.getElementById('pause-btn').addEventListener('click', () => this.togglePause());
        document.getElementById('stop-dictation-btn').addEventListener('click', () => this.stopDictation());
        document.getElementById('restart-btn').addEventListener('click', () => this.restartDictation());
        document.getElementById('speak-all-btn').addEventListener('click', () => this.speakAllResults());

        document.getElementById('close-modal-btn').addEventListener('click', () => this.closeModal());
        document.getElementById('modal-speak-us-btn').addEventListener('click', () => {
            this.currentAccent = 'US';
            this.updateAccentButtons();
            this.playYoudaoAudio(document.getElementById('modal-word').textContent, 1);
        });
        document.getElementById('modal-speak-uk-btn').addEventListener('click', () => {
            this.currentAccent = 'UK';
            this.updateAccentButtons();
            this.playYoudaoAudio(document.getElementById('modal-word').textContent, 2);
        });
        document.getElementById('modal-delete-btn').addEventListener('click', () => this.deleteCurrentWord());
        document.getElementById('word-modal').addEventListener('click', (e) => {
            if (e.target.id === 'word-modal') this.closeModal();
        });
    }

    switchTab(tabId) {
        document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.toggle('active', btn.dataset.tab === tabId));
        document.querySelectorAll('.tab-content').forEach(content => content.classList.toggle('active', content.id === tabId + '-tab'));
        if (tabId === 'batches') this.renderBatchList();
        if (tabId === 'dictation') this.renderAvailableBatches();
    }

    updateBatchIndicator() {
        document.getElementById('batch-indicator').textContent = `批次 #${this.nextBatchId}`;
    }

    // 渲染可用批次（听写页面）
    renderAvailableBatches() {
        const container = document.getElementById('batch-tags');

        if (this.batches.length === 0) {
            container.innerHTML = `<span class="batch-empty">暂无批次，请先录入单词</span>`;
            return;
        }

        container.innerHTML = `<div class="batch-tags-container">
            ${this.batches.map(batch => `
                <span class="batch-select-tag" data-batch="${batch.id}" onclick="app.selectBatch(${batch.id})">
                    #${batch.id} (${batch.words.length}词)
                </span>
            `).join('')}
        </div>`;
    }

    // 点击选择批次
    selectBatch(batchId) {
        const input = document.getElementById('batch-numbers');
        const currentValue = input.value.trim();

        if (currentValue) {
            const numbers = currentValue.split(/[,，、\s]+/).filter(n => n.trim());
            if (!numbers.includes(String(batchId))) {
                input.value = currentValue + ',' + batchId;
            }
        } else {
            input.value = batchId;
        }

        this.parseBatchNumbers(input.value);
    }

    async previewWords() {
        const input = document.getElementById('word-input').value.trim();
        if (!input) {
            this.showToast('请输入单词');
            return;
        }

        const words = input.split(/[\n,，、\s]+/).filter(w => w.trim());
        if (words.length === 0) {
            this.showToast('请输入有效的单词');
            return;
        }

        this.pendingWords = words.map(w => ({
            word: w.trim().toLowerCase(),
            phonetic: '',
            meaning: '',
            status: 'loading'
        }));

        this.renderPreview();
        document.getElementById('preview-card').style.display = 'block';
        document.getElementById('word-input').disabled = true;
        document.getElementById('add-words-btn').disabled = true;

        for (let i = 0; i < this.pendingWords.length; i++) {
            try {
                const info = await this.fetchYoudaoInfo(this.pendingWords[i].word);
                this.pendingWords[i].phonetic = info.phonetic;
                this.pendingWords[i].meaning = info.meaning;
                this.pendingWords[i].status = 'success';
            } catch (e) {
                console.error('Fetch error:', e);
                this.pendingWords[i].status = 'success';
                this.pendingWords[i].meaning = this.pendingWords[i].word;
            }
            this.renderPreview();
            if (i < this.pendingWords.length - 1) await this.delay(300);
        }

        document.getElementById('word-input').disabled = false;
        document.getElementById('add-words-btn').disabled = false;
    }

    renderPreview() {
        const list = document.getElementById('preview-list');
        list.innerHTML = this.pendingWords.map(item => `
            <div class="preview-item">
                <span class="preview-word">${item.word}</span>
                <span style="font-size:12px;color:#666;flex:1;margin-left:10px">${item.meaning || '获取中...'}</span>
                <span class="preview-status ${item.status}">${item.status === 'loading' ? '⏳' : '✓'}</span>
            </div>
        `).join('');
    }

    confirmBatch() {
        if (!this.pendingWords || this.pendingWords.length === 0) {
            this.showToast('没有可添加的单词');
            return;
        }

        const batch = {
            id: this.nextBatchId,
            date: new Date().toLocaleString('zh-CN'),
            words: [...this.pendingWords]
        };

        this.batches.push(batch);
        this.nextBatchId++;
        this.saveData();

        this.showToast(`已添加批次 #${batch.id}，共 ${batch.words.length} 个单词`);

        document.getElementById('word-input').value = '';
        document.getElementById('preview-card').style.display = 'none';
        this.pendingWords = [];
        this.updateBatchIndicator();
        this.renderBatchList();
    }

    cancelPreview() {
        document.getElementById('word-input').disabled = false;
        document.getElementById('add-words-btn').disabled = false;
        document.getElementById('preview-card').style.display = 'none';
        this.pendingWords = [];
    }

    // 使用有道API获取单词信息（通过CORS代理）
    async fetchYoudaoInfo(word) {
        let phonetic = '';
        let meaning = '';

        // 方案1: 有道词典API（通过CORS代理）
        try {
            // 使用corsproxy.io代理
            const proxyUrl = 'https://corsproxy.io/?';
            const youdaoUrl = encodeURIComponent(`https://dict.youdao.com/jsonapi?q=${word}`);

            const response = await fetch(proxyUrl + youdaoUrl);
            if (response.ok) {
                const data = await response.json();

                // 获取音标
                if (data.ec && data.ec.word) {
                    const wordInfo = data.ec.word[0];
                    phonetic = wordInfo.usphone || wordInfo.ukphone || '';
                }

                // 获取中文释义
                if (data.ec && data.ec.trans) {
                    meaning = data.ec.trans.map(t => {
                        if (t.tran) {
                            return t.pos ? `${t.pos} ${t.tran}` : t.tran;
                        }
                        return '';
                    }).filter(m => m).slice(0, 3).join('; ');
                }
            }
        } catch (e) {
            console.log('Youdao API failed:', e);
        }

        // 方案2: 有道suggest API（更简单，通过代理）
        if (!meaning) {
            try {
                const proxyUrl = 'https://corsproxy.io/?';
                const suggestUrl = encodeURIComponent(`https://dict.youdao.com/suggest?num=1&doctype=json&q=${word}`);

                const response = await fetch(proxyUrl + suggestUrl);
                if (response.ok) {
                    const text = await response.text();
                    try {
                        const data = JSON.parse(text);
                        if (data.data && data.data.entries && data.data.entries.length > 0) {
                            meaning = data.data.entries[0].explain || '';
                        }
                    } catch (parseErr) {
                        // 尝试匹配JSON
                        const match = text.match(/\{.*\}/);
                        if (match) {
                            const data = JSON.parse(match[0]);
                            if (data.data?.entries?.[0]) {
                                meaning = data.data.entries[0].explain || '';
                            }
                        }
                    }
                }
            } catch (e) {
                console.log('Youdao suggest failed:', e);
            }
        }

        // 方案3: MyMemory翻译作为备用
        if (!meaning) {
            try {
                const response = await fetch(`https://api.mymemory.translated.net/get?q=${encodeURIComponent(word)}&langpair=en|zh-CN`);
                if (response.ok) {
                    const data = await response.json();
                    if (data.responseStatus === 200) {
                        meaning = data.responseData.translatedText;
                    }
                }
            } catch (e) {
                console.log('MyMemory failed:', e);
            }
        }

        return {
            phonetic: phonetic,
            meaning: meaning || word,
            error: false
        };
    }

    renderBatchList() {
        const container = document.getElementById('batch-list');
        const totalWords = this.batches.reduce((sum, b) => sum + b.words.length, 0);

        document.getElementById('batch-count').textContent = `共 ${this.batches.length} 个批次`;
        document.getElementById('total-words-count').textContent = `${totalWords} 个单词`;

        if (this.batches.length === 0) {
            container.innerHTML = `<div class="empty-state"><p>暂无批次数据</p><p>请先录入单词，数据会自动保存</p></div>`;
            return;
        }

        container.innerHTML = this.batches.slice().reverse().map(batch => `
            <div class="batch-item">
                <div class="batch-header">
                    <span class="batch-title">批次 #${batch.id} (${batch.words.length}个)</span>
                    <span class="batch-date">${batch.date}</span>
                </div>
                <div class="batch-words">
                    ${batch.words.map(w => `<span class="word-tag" data-word="${w.word}" data-batch="${batch.id}">${w.word}</span>`).join('')}
                </div>
                <div class="batch-actions">
                    <button class="btn btn-sm btn-danger" onclick="app.deleteBatch(${batch.id})">删除批次</button>
                </div>
            </div>
        `).join('');

        container.querySelectorAll('.word-tag').forEach(tag => {
            tag.addEventListener('click', () => {
                this.showWordDetail(tag.dataset.word, parseInt(tag.dataset.batch));
            });
        });
    }

    showWordDetail(word, batchId) {
        const batch = this.batches.find(b => b.id === batchId);
        if (!batch) return;

        const wordData = batch.words.find(w => w.word === word);
        if (!wordData) return;

        this.currentWord = { word, batchId };

        document.getElementById('modal-batch-info').textContent = `批次 #${batchId}`;
        document.getElementById('modal-word').textContent = wordData.word;
        document.getElementById('modal-phonetic').textContent = wordData.phonetic ? `/${wordData.phonetic}/` : '';
        document.getElementById('modal-meaning').textContent = wordData.meaning || '';

        this.currentAccent = 'US';
        this.updateAccentButtons();
        document.getElementById('word-modal').style.display = 'flex';
    }

    updateAccentButtons() {
        document.getElementById('modal-speak-us-btn').classList.toggle('active', this.currentAccent === 'US');
        document.getElementById('modal-speak-uk-btn').classList.toggle('active', this.currentAccent === 'UK');
    }

    closeModal() {
        document.getElementById('word-modal').style.display = 'none';
        this.currentWord = null;
    }

    deleteCurrentWord() {
        if (!this.currentWord) return;

        const { word, batchId } = this.currentWord;
        const batch = this.batches.find(b => b.id === batchId);
        if (!batch) return;

        batch.words = batch.words.filter(w => w.word !== word);
        if (batch.words.length === 0) {
            this.batches = this.batches.filter(b => b.id !== batchId);
        }

        this.saveData();
        this.closeModal();
        this.renderBatchList();
        this.showToast('已删除单词');
    }

    deleteBatch(batchId) {
        if (!confirm(`确定删除批次 #${batchId} 吗？`)) return;

        this.batches = this.batches.filter(b => b.id !== batchId);
        this.saveData();
        this.renderBatchList();
        this.showToast('已删除批次');
    }

    parseBatchNumbers(value) {
        const container = document.getElementById('selected-batches');
        if (!value.trim()) {
            container.innerHTML = '';
            document.querySelectorAll('.batch-select-tag').forEach(tag => tag.classList.remove('selected'));
            return;
        }

        const numbers = value.split(/[,，、\s]+/).filter(n => n.trim()).map(n => parseInt(n.trim()));
        const validNumbers = [];
        const invalidNumbers = [];

        numbers.forEach(num => {
            if (!isNaN(num) && this.batches.some(b => b.id === num)) {
                validNumbers.push(num);
            } else if (!isNaN(num)) {
                invalidNumbers.push(num);
            }
        });

        let html = '';
        if (validNumbers.length > 0) {
            const totalWords = validNumbers.reduce((sum, id) => {
                const batch = this.batches.find(b => b.id === id);
                return sum + (batch ? batch.words.length : 0);
            }, 0);
            html += validNumbers.map(n => `<span class="selected-batch-tag">✓ 批次 #${n}</span>`).join('');
            html += `<span style="color:#4CAF50;font-size:12px;margin-left:10px">共 ${totalWords} 个单词</span>`;
        }
        if (invalidNumbers.length > 0) {
            html += `<span class="batch-error">未找到: ${invalidNumbers.join(', ')}</span>`;
        }

        container.innerHTML = html;

        document.querySelectorAll('.batch-select-tag').forEach(tag => {
            const id = parseInt(tag.dataset.batch);
            tag.classList.toggle('selected', validNumbers.includes(id));
        });
    }

    startDictation() {
        const input = document.getElementById('batch-numbers').value.trim();
        if (!input) {
            this.showToast('请输入批次序号');
            return;
        }

        const numbers = input.split(/[,，、\s]+/).filter(n => n.trim()).map(n => parseInt(n.trim()));
        const validBatches = numbers.filter(n => !isNaN(n) && this.batches.some(b => b.id === n));

        if (validBatches.length === 0) {
            this.showToast('没有有效的批次');
            return;
        }

        let words = [];
        validBatches.forEach(batchId => {
            const batch = this.batches.find(b => b.id === batchId);
            if (batch) {
                batch.words.forEach(w => words.push({ ...w, batchId }));
            }
        });

        if (words.length === 0) {
            this.showToast('选中的批次没有单词');
            return;
        }

        if (document.getElementById('play-order').value === 'random') {
            words = this.shuffleArray(words);
        }

        const accent = document.querySelector('input[name="accent"]:checked').value;
        const shortInterval = parseInt(document.getElementById('short-interval').value) * 1000;
        const longInterval = parseInt(document.getElementById('long-interval').value) * 1000;

        this.currentDictation = {
            words,
            currentIndex: 0,
            repeatCount: parseInt(document.getElementById('repeat-count').value),
            speechRate: parseFloat(document.getElementById('speech-rate').value),
            accent,
            shortInterval,
            longInterval
        };

        document.getElementById('dictation-setup').style.display = 'none';
        document.getElementById('dictation-progress').style.display = 'block';
        document.getElementById('dictation-result').style.display = 'none';
        document.getElementById('total-count').textContent = words.length;

        this.isPaused = false;
        document.getElementById('pause-btn').textContent = '暂停';

        this.playCurrentWord();
    }

    shuffleArray(array) {
        const arr = [...array];
        for (let i = arr.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [arr[i], arr[j]] = [arr[j], arr[i]];
        }
        return arr;
    }

    async playCurrentWord() {
        while (this.isPaused) await this.delay(100);

        const { words, currentIndex, repeatCount, speechRate, accent, shortInterval, longInterval } = this.currentDictation;
        const word = words[currentIndex];

        document.getElementById('current-index').textContent = currentIndex + 1;
        document.getElementById('current-batch').textContent = `批次 #${word.batchId}`;
        document.getElementById('progress-fill').style.width = ((currentIndex / words.length) * 100) + '%';

        const display = document.getElementById('word-display');
        const repeatProgress = document.getElementById('repeat-progress');

        // 单词长度判断：<=5字母为短单词，>5字母为长单词
        const wordLength = word.word.length;
        const isShortWord = wordLength <= 5;
        const interval = isShortWord ? shortInterval : longInterval;

        console.log(`单词: ${word.word}, 长度: ${wordLength}, 短单词: ${isShortWord}, 间隔: ${interval/1000}秒`);

        for (let i = 0; i < repeatCount; i++) {
            while (this.isPaused) await this.delay(100);

            display.innerHTML = `<div class="word-reading">正在朗读...</div>`;
            repeatProgress.textContent = `朗读第 ${i + 1} 次 / 共 ${repeatCount} 次`;

            // 使用有道TTS发音
            const type = accent === 'US' ? 1 : 2;
            await this.playYoudaoAudio(word.word, type, speechRate);

            if (i < repeatCount - 1) {
                display.innerHTML = `<div class="word-waiting">等待 ${Math.round(interval / 1000)} 秒...</div>`;
                repeatProgress.textContent = `${isShortWord ? '短' : '长'}单词，间隔 ${Math.round(interval / 1000)} 秒`;
                await this.delay(interval);
            }
        }

        display.innerHTML = `<div class="word-waiting">请写下单词</div>`;
        repeatProgress.textContent = '朗读完成，请书写';

        await this.delay(8000);
        this.nextWord();
    }

    // 有道TTS发音
    playYoudaoAudio(word, type = 1, rate = 0.85) {
        return new Promise((resolve) => {
            // type: 1=美式, 2=英式
            const audioUrl = `https://dict.youdao.com/dictvoice?type=${type}&audio=${encodeURIComponent(word)}`;
            const audio = new Audio(audioUrl);
            audio.playbackRate = rate;

            audio.onended = resolve;
            audio.onerror = () => {
                this.speakFallback(word, type === 1 ? 'US' : 'UK', rate).then(resolve);
            };
            audio.play().catch(() => {
                this.speakFallback(word, type === 1 ? 'US' : 'UK', rate).then(resolve);
            });
        });
    }

    // Web Speech API备用
    speakFallback(word, accent = 'US', rate = 0.85) {
        return new Promise((resolve) => {
            if (!('speechSynthesis' in window)) {
                resolve();
                return;
            }

            speechSynthesis.cancel();
            const utterance = new SpeechSynthesisUtterance(word);
            utterance.lang = accent === 'US' ? 'en-US' : 'en-GB';
            utterance.rate = rate;

            const voices = speechSynthesis.getVoices();
            const targetVoice = voices.find(v =>
                (accent === 'US' && v.lang.includes('US')) ||
                (accent === 'UK' && (v.lang.includes('GB') || v.lang.includes('UK')))
            );
            if (targetVoice) utterance.voice = targetVoice;

            utterance.onend = resolve;
            utterance.onerror = resolve;
            speechSynthesis.speak(utterance);
        });
    }

    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    togglePause() {
        this.isPaused = !this.isPaused;
        document.getElementById('pause-btn').textContent = this.isPaused ? '继续' : '暂停';
        if (this.isPaused) {
            document.getElementById('word-display').innerHTML = `<div class="word-waiting">已暂停</div>`;
        }
    }

    nextWord() {
        this.currentDictation.currentIndex++;
        if (this.currentDictation.currentIndex >= this.currentDictation.words.length) {
            this.showResult();
        } else {
            this.playCurrentWord();
        }
    }

    stopDictation() {
        if (confirm('确定停止听写吗？')) {
            this.isPaused = false;
            this.showResult();
        }
    }

    showResult() {
        const { words, accent } = this.currentDictation;

        document.getElementById('dictation-progress').style.display = 'none';
        document.getElementById('dictation-result').style.display = 'block';
        document.getElementById('total-words').textContent = words.length;

        const type = accent === 'US' ? 1 : 2;
        const resultList = document.getElementById('result-list');
        resultList.innerHTML = words.map(w => `
            <div class="result-item">
                <span class="word-text">${w.word}</span>
                <span class="word-phonetic">${w.phonetic ? `/${w.phonetic}/` : ''}</span>
                <span class="word-meaning">${w.meaning || ''}</span>
                <button class="btn-speak-small" onclick="app.playYoudaoAudio('${w.word}', ${type})">🔊</button>
            </div>
        `).join('');
    }

    async speakAllResults() {
        const { words, accent } = this.currentDictation;
        const type = accent === 'US' ? 1 : 2;
        this.showToast('开始朗读全部答案...');

        for (const w of words) {
            await this.playYoudaoAudio(w.word, type);
            await this.delay(1500);
        }

        this.showToast('朗读完成');
    }

    restartDictation() {
        document.getElementById('dictation-setup').style.display = 'block';
        document.getElementById('dictation-progress').style.display = 'none';
        document.getElementById('dictation-result').style.display = 'none';
        this.currentDictation = null;
        this.isPaused = false;
    }

    importData(event) {
        const file = event.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const data = JSON.parse(e.target.result);
                if (data.batches) {
                    this.batches = data.batches;
                    this.nextBatchId = data.nextBatchId || 1;
                    this.saveData();
                    this.updateBatchIndicator();
                    this.renderBatchList();
                    this.showToast('导入成功');
                }
            } catch (error) {
                this.showToast('导入失败');
            }
        };
        reader.readAsText(file);
        event.target.value = '';
    }

    exportData() {
        if (this.batches.length === 0) {
            this.showToast('没有数据可导出');
            return;
        }

        const data = JSON.stringify({ batches: this.batches, nextBatchId: this.nextBatchId }, null, 2);
        const blob = new Blob([data], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `dictation_${new Date().toISOString().slice(0, 10)}.json`;
        a.click();
        URL.revokeObjectURL(url);
        this.showToast('导出成功');
    }

    clearAll() {
        if (!confirm('确定清空所有数据吗？')) return;

        this.batches = [];
        this.nextBatchId = 1; // 重置批次号从1开始
        this.saveData();
        this.updateBatchIndicator();
        this.renderBatchList();
        this.renderAvailableBatches();
        this.showToast('已清空所有数据');
    }

    showToast(message) {
        const toast = document.getElementById('toast');
        toast.textContent = message;
        toast.classList.add('show');
        setTimeout(() => toast.classList.remove('show'), 2500);
    }
}

const app = new DictationApp();