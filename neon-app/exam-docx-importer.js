(() => {
  // Pure client-side DOCX unzipper and exam parser
  // Extracts questions, choices, and answer keys without external dependencies

  async function extractDocx(fileOrBuffer) {
    let arrayBuffer;
    if (fileOrBuffer instanceof ArrayBuffer) {
      arrayBuffer = fileOrBuffer;
    } else if (fileOrBuffer instanceof Blob || fileOrBuffer instanceof File) {
      arrayBuffer = await fileOrBuffer.arrayBuffer();
    } else {
      throw new Error('Invalid file format. Please provide a Word document (.docx).');
    }

    const bytes = new Uint8Array(arrayBuffer);
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    let offset = 0;
    let documentXmlBytes = null;

    while (offset + 30 <= bytes.length) {
      const sig = view.getUint32(offset, true);
      if (sig !== 0x04034b50) break; // End of local file headers

      const method = view.getUint16(offset + 8, true);
      const compSize = view.getUint32(offset + 18, true);
      const fnLen = view.getUint16(offset + 26, true);
      const extraLen = view.getUint16(offset + 28, true);

      const fnBytes = bytes.subarray(offset + 30, offset + 30 + fnLen);
      const filename = new TextDecoder().decode(fnBytes);
      const dataOffset = offset + 30 + fnLen + extraLen;

      if (filename === 'word/document.xml') {
        const compData = bytes.subarray(dataOffset, dataOffset + compSize);
        if (method === 8) { // Deflate
          const ds = new DecompressionStream('deflate-raw');
          const writer = ds.writable.getWriter();
          writer.write(compData);
          writer.close();
          const decompressedBuffer = await new Response(ds.readable).arrayBuffer();
          documentXmlBytes = new Uint8Array(decompressedBuffer);
        } else if (method === 0) { // Stored / Uncompressed
          documentXmlBytes = compData;
        }
        break;
      }
      offset = dataOffset + compSize;
    }

    if (!documentXmlBytes) {
      throw new Error('Could not find word/document.xml in the Word file. Ensure this is a valid .docx document.');
    }

    const xmlText = new TextDecoder('utf-8').decode(documentXmlBytes);
    const xmlDoc = new DOMParser().parseFromString(xmlText, 'text/xml');
    const paragraphs = [];
    const pNodes = xmlDoc.getElementsByTagName('w:p');

    for (let p of pNodes) {
      let pText = '';
      let isBold = false;
      const rNodes = p.getElementsByTagName('w:r');
      for (let r of rNodes) {
        const bNodes = r.getElementsByTagName('w:b');
        if (bNodes.length > 0) isBold = true;
        const tNodes = r.getElementsByTagName('w:t');
        for (let t of tNodes) {
          pText += t.textContent;
        }
      }
      const trimmed = pText.trim();
      if (trimmed) {
        paragraphs.push({ text: trimmed, bold: isBold });
      }
    }
    return paragraphs;
  }

  function parseExamText(input) {
    let items = [];
    let lines = [];

    if (Array.isArray(input)) {
      lines = input; // [{ text, bold }]
    } else if (typeof input === 'string') {
      lines = input.split(/\r?\n/).map(l => ({ text: l.trim(), bold: false })).filter(l => l.text);
    } else {
      return [];
    }

    // Step 1: Detect trailing Answer Key section
    let answerKeyMap = new Map();
    let mainLines = [];
    let inAnswerKeySection = false;

    const answerKeyHeaderRegex = /^(answer\s*key|key\s*answers?|susi\s*ng\s*pagwawasto|mga\s*sagot|mga\s*tamang\s*sagot)[\:\s\-]*$/i;
    const answerKeyLineRegex = /^(\d+)[\.\)\:\-\s]+([A-Za-z0-9\s\-_,\.\'\"]+)/;

    for (let item of lines) {
      const text = item.text.trim();
      if (answerKeyHeaderRegex.test(text)) {
        inAnswerKeySection = true;
        continue;
      }

      if (inAnswerKeySection) {
        const match = text.match(answerKeyLineRegex);
        if (match) {
          const num = parseInt(match[1], 10);
          const ans = match[2].trim();
          answerKeyMap.set(num, ans);
        }
      } else {
        mainLines.push(item);
      }
    }

    // Step 2: Parse questions and choices
    const questionStartRegex = /^(\d+)[\.\)\:\-]\s*(.+)$/;
    const choiceRegex = /^([A-Da-d])[\.\)\:\-]\s*(.+)$/;
    const inlineAnswerRegex = /^(answer|ans|key|tamang\s*sagot)[\:\=\s]+(.+)$/i;

    let currentQuestion = null;
    let itemNumber = 1;

    for (let lineObj of mainLines) {
      const text = lineObj.text;
      const isBold = lineObj.bold;

      // Check inline answer key
      const ansMatch = text.match(inlineAnswerRegex);
      if (ansMatch && currentQuestion) {
        currentQuestion.detectedAnswer = ansMatch[2].trim();
        continue;
      }

      // Check choice line
      // First check if line contains multiple choices: e.g. "A. Cat  B. Dog  C. Fish  D. Bird"
      const multiChoiceSplit = splitMultiChoices(text);
      if (multiChoiceSplit.length > 1 && currentQuestion) {
        for (let c of multiChoiceSplit) {
          const cleanChoice = cleanChoiceText(c.text);
          currentQuestion.choices.push(cleanChoice);
          if (c.isKey || isBold) {
            currentQuestion.detectedAnswer = cleanChoice;
          }
        }
        continue;
      }

      const choiceMatch = text.match(choiceRegex);
      if (choiceMatch && currentQuestion) {
        let choiceLetter = choiceMatch[1].toUpperCase();
        let choiceText = choiceMatch[2].trim();
        let isMarkedKey = false;

        // Check for asterisk or checkbox mark
        if (choiceText.startsWith('*') || choiceText.startsWith('[x]') || choiceText.startsWith('(x)')) {
          choiceText = choiceText.replace(/^(\*|\[x\]|\(x\))\s*/i, '');
          isMarkedKey = true;
        }

        currentQuestion.choices.push(choiceText);
        if (isMarkedKey || isBold) {
          currentQuestion.detectedAnswer = choiceText;
        }
        continue;
      }

      // Check question stem
      const qMatch = text.match(questionStartRegex);
      if (qMatch) {
        if (currentQuestion) {
          finalizeQuestion(currentQuestion, answerKeyMap);
          items.push(currentQuestion);
        }

        const num = parseInt(qMatch[1], 10) || itemNumber;
        currentQuestion = {
          id: crypto.randomUUID(),
          itemNo: num,
          prompt: qMatch[2].trim(),
          type: 'mcq',
          choices: [],
          detectedAnswer: null,
          answer: '',
          points: 1
        };
        itemNumber++;
        continue;
      }

      // Continuation of previous question prompt if no choices yet
      if (currentQuestion && currentQuestion.choices.length === 0) {
        currentQuestion.prompt += ' ' + text;
      }
    }

    if (currentQuestion) {
      finalizeQuestion(currentQuestion, answerKeyMap);
      items.push(currentQuestion);
    }

    return items;
  }

  function splitMultiChoices(text) {
    // Looks for patterns like "A. ... B. ... C. ... D. ..."
    const parts = text.split(/\s+([A-Da-d][\.\)\:\-])\s+/);
    if (parts.length < 3) return [];

    let results = [];
    let currentLetter = '';
    for (let part of parts) {
      const match = part.match(/^([A-Da-d])[\.\)\:\-]$/);
      if (match) {
        currentLetter = match[1].toUpperCase();
      } else if (currentLetter) {
        results.push({ letter: currentLetter, text: part.trim(), isKey: part.includes('*') });
        currentLetter = '';
      }
    }
    return results;
  }

  function cleanChoiceText(str) {
    return str.replace(/^(\*|\[x\]|\(x\))\s*/i, '').trim();
  }

  function finalizeQuestion(q, answerKeyMap) {
    // 1. Determine Question Type
    const lowerChoices = q.choices.map(c => c.toLowerCase());
    const isTF = q.choices.length === 2 && (
      (lowerChoices.includes('true') && lowerChoices.includes('false')) ||
      (lowerChoices.includes('tama') && lowerChoices.includes('mali'))
    );

    if (isTF) {
      q.type = 'truefalse';
      q.choices = ['True', 'False'];
    } else if (q.choices.length >= 2) {
      q.type = 'mcq';
    } else {
      q.type = 'identification';
      q.choices = [];
    }

    // 2. Resolve Answer Key
    // Priority A: answerKeyMap from end of document
    if (answerKeyMap.has(q.itemNo)) {
      const rawKey = answerKeyMap.get(q.itemNo).trim();
      const letterMatch = rawKey.match(/^([A-Da-d])$/);
      if (letterMatch && q.choices.length > 0) {
        const idx = letterMatch[1].toUpperCase().charCodeAt(0) - 65; // A -> 0, B -> 1
        if (q.choices[idx]) {
          q.answer = q.choices[idx];
        }
      } else {
        q.answer = rawKey;
      }
    }

    // Priority B: Inline detected answer
    if (!q.answer && q.detectedAnswer) {
      const det = q.detectedAnswer.trim();
      const letterMatch = det.match(/^([A-Da-d])$/);
      if (letterMatch && q.choices.length > 0) {
        const idx = letterMatch[1].toUpperCase().charCodeAt(0) - 65;
        if (q.choices[idx]) {
          q.answer = q.choices[idx];
        }
      } else {
        // Find closest choice match
        const matchingChoice = q.choices.find(c => c.toLowerCase() === det.toLowerCase());
        q.answer = matchingChoice || det;
      }
    }

    // Clean up temporary field
    delete q.detectedAnswer;
  }

  // --- Interactive Review Screen ---
  function renderReviewScreen(draft) {
    const classes = (typeof teacherClasses === 'function') ? teacherClasses() : [];
    const questions = draft.questions || [];
    const questionsWithKeys = questions.filter(q => q.answer && q.answer.trim()).length;
    const questionsWithoutKeys = questions.length - questionsWithKeys;

    return `
      <section class="grid">
        <div class="panel span-12" style="background:#ffffff; border-radius:10px; padding:24px;">
          <div class="panel-title" style="display:flex; justify-content:space-between; align-items:flex-start; flex-wrap:wrap; gap:16px; border-bottom:1px solid var(--line); padding-bottom:16px; margin-bottom:20px;">
            <div>
              <h2 style="margin:0 0 4px 0; color:var(--ink);">Review & Verify Online Exam</h2>
              <span class="muted">Check extracted questions, confirm answer keys, and adjust details before publishing for instant auto-grading</span>
            </div>
            <div style="display:flex; gap:10px; align-items:center;">
              <button class="ghost" type="button" id="cancelExamReview">Discard Draft</button>
              <button class="button" type="button" id="publishAutoExam" style="font-weight:700; padding:10px 20px;">Publish Online Exam</button>
            </div>
          </div>

          <!-- Metadata Bar -->
          <div class="form-grid" style="background:var(--soft); padding:18px; border-radius:8px; margin-bottom:24px;">
            <label class="full">
              Exam Title
              <input id="reviewExamTitle" type="text" value="${esc(draft.title || 'Quarterly Examination')}" required placeholder="e.g. Science 7 - 1st Periodical Test">
            </label>
            <label>
              Target Class
              <select id="reviewExamClass" required>
                ${classes.map(c => `<option value="${c.id}" ${c.id === draft.classId ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}
              </select>
            </label>
            <label>
              Due Date
              <input id="reviewExamDue" type="date" value="${draft.due || new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10)}" required>
            </label>
            <label>
              Quarter
              <select id="reviewExamQuarter">
                <option ${draft.quarter === 'Quarter 1' ? 'selected' : ''}>Quarter 1</option>
                <option ${draft.quarter === 'Quarter 2' ? 'selected' : ''}>Quarter 2</option>
                <option ${draft.quarter === 'Quarter 3' ? 'selected' : ''}>Quarter 3</option>
                <option ${draft.quarter === 'Quarter 4' ? 'selected' : ''}>Quarter 4</option>
              </select>
            </label>
            <label>
              Subject
              <select id="reviewExamSubject">
                <option ${draft.subject === 'Science' ? 'selected' : ''}>Science</option>
                <option ${draft.subject === 'Mathematics' ? 'selected' : ''}>Mathematics</option>
                <option ${draft.subject === 'English' ? 'selected' : ''}>English</option>
                <option ${draft.subject === 'Filipino' ? 'selected' : ''}>Filipino</option>
                <option ${draft.subject === 'Araling Panlipunan' ? 'selected' : ''}>Araling Panlipunan</option>
                <option ${draft.subject === 'MAPEH' ? 'selected' : ''}>MAPEH</option>
                <option ${draft.subject === 'TLE / EPP' ? 'selected' : ''}>TLE / EPP</option>
                <option ${draft.subject === 'Values Education / EsP' ? 'selected' : ''}>Values Education / EsP</option>
              </select>
            </label>
            <label>
              Assessment Component
              <select id="reviewExamComponent">
                <option ${draft.component === 'Written Work' ? 'selected' : ''}>Written Work</option>
                <option ${draft.component === 'Quarterly Assessment' ? 'selected' : ''}>Quarterly Assessment</option>
                <option ${draft.component === 'Formative Check' ? 'selected' : ''}>Formative Check</option>
              </select>
            </label>
            <label>
              Time Limit (Minutes)
              <input id="reviewExamTimeLimit" type="number" min="0" value="${draft.timeLimit || 60}" placeholder="0 for no limit">
            </label>
          </div>

          <!-- Status Banner -->
          <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:12px; margin-bottom:16px;">
            <div style="display:flex; gap:10px; align-items:center; flex-wrap:wrap;">
              <span class="chip green" style="font-weight:600; font-size:0.95rem;">${questions.length} Items Detected</span>
              <span class="chip" style="font-weight:600;">${questionsWithKeys} Answer Keys Ready</span>
              ${questionsWithoutKeys > 0 ? `<span class="chip gold" style="font-weight:700;">⚠️ ${questionsWithoutKeys} Needs Correct Answer</span>` : ''}
            </div>
            <button class="ghost" type="button" id="reviewAddQuestion">+ Add New Question</button>
          </div>

          <!-- Question Items List -->
          <div id="reviewQuestionsContainer" style="display:flex; flex-direction:column; gap:16px;">
            ${questions.map((q, idx) => renderQuestionCard(q, idx)).join('')}
          </div>

          <div style="display:flex; justify-content:space-between; align-items:center; margin-top:24px; padding-top:16px; border-top:1px solid var(--line);">
            <button class="ghost" type="button" id="reviewAddQuestionBottom">+ Add New Question</button>
            <button class="button" type="button" id="publishAutoExamBottom" style="font-weight:700; padding:10px 24px;">Publish Online Exam</button>
          </div>
        </div>
      </section>
    `;
  }

  function renderQuestionCard(q, index) {
    const hasKey = q.answer && q.answer.trim().length > 0;
    const isMCQ = q.type === 'mcq';
    const isTF = q.type === 'truefalse';
    const isIdent = q.type === 'identification';

    return `
      <div class="question-card" data-index="${index}" style="border:1px solid ${hasKey ? 'var(--line)' : '#f2b705'}; border-radius:8px; padding:18px; background:#fafcff;">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px; flex-wrap:wrap; gap:8px;">
          <div style="display:flex; align-items:center; gap:10px;">
            <strong style="font-size:1.05rem; color:var(--ink);">Item ${index + 1}</strong>
            <select class="q-type-select" data-index="${index}" style="padding:4px 8px; border-radius:6px; font-size:0.9rem;">
              <option value="mcq" ${isMCQ ? 'selected' : ''}>Multiple Choice</option>
              <option value="truefalse" ${isTF ? 'selected' : ''}>True / False</option>
              <option value="identification" ${isIdent ? 'selected' : ''}>Identification</option>
            </select>
          </div>
          <div style="display:flex; align-items:center; gap:8px;">
            <label style="margin:0; font-size:0.85rem; display:flex; align-items:center; gap:4px;">
              Points:
              <input class="q-points-input" data-index="${index}" type="number" min="1" max="10" value="${q.points || 1}" style="width:50px; padding:4px;">
            </label>
            <button class="danger ghost q-delete-btn" data-index="${index}" type="button" title="Delete Item">✕</button>
          </div>
        </div>

        <!-- Question Prompt -->
        <label style="margin-bottom:12px; display:block;">
          <textarea class="q-prompt-input" data-index="${index}" rows="2" style="width:100%; border-radius:6px; padding:8px; font-family:inherit;" placeholder="Question prompt...">${esc(q.prompt)}</textarea>
        </label>

        <!-- Choices / Answers -->
        <div class="q-choices-area" data-index="${index}">
          ${isMCQ ? renderMCQChoices(q, index) : isTF ? renderTFChoices(q, index) : renderIdentAnswer(q, index)}
        </div>
      </div>
    `;
  }

  function renderMCQChoices(q, index) {
    const choices = q.choices && q.choices.length ? q.choices : ['Option A', 'Option B', 'Option C', 'Option D'];
    return `
      <div style="display:flex; flex-direction:column; gap:8px;">
        <span style="font-size:0.85rem; font-weight:600; color:var(--ink); opacity:0.8;">Choices (click radio button to set correct answer):</span>
        ${choices.map((choice, cIdx) => {
          const isCorrect = q.answer === choice;
          return `
            <div style="display:flex; align-items:center; gap:10px; background:${isCorrect ? '#e8f5e9' : '#ffffff'}; padding:6px 12px; border:1px solid ${isCorrect ? 'var(--green)' : 'var(--line)'}; border-radius:6px;">
              <input type="radio" name="correct_key_${index}" class="q-key-radio" data-index="${index}" data-choice-idx="${cIdx}" ${isCorrect ? 'checked' : ''} title="Mark as correct answer">
              <strong style="opacity:0.6; min-width:20px;">${String.fromCharCode(65 + cIdx)}.</strong>
              <input type="text" class="q-choice-text" data-index="${index}" data-choice-idx="${cIdx}" value="${esc(choice)}" style="flex:1; border:none; background:transparent; font-size:0.95rem;">
              ${isCorrect ? '<span class="chip green" style="font-size:0.75rem; padding:2px 8px;">✔ Correct</span>' : ''}
              ${choices.length > 2 ? `<button type="button" class="ghost q-del-choice-btn" data-index="${index}" data-choice-idx="${cIdx}" style="padding:2px 6px; opacity:0.6;" title="Remove choice">✕</button>` : ''}
            </div>
          `;
        }).join('')}
        <div>
          <button type="button" class="ghost q-add-choice-btn" data-index="${index}" style="font-size:0.85rem; padding:4px 8px;">+ Add Choice</button>
        </div>
      </div>
    `;
  }

  function renderTFChoices(q, index) {
    const isTrue = q.answer === 'True';
    const isFalse = q.answer === 'False';
    return `
      <div style="display:flex; gap:16px; align-items:center; margin-top:6px;">
        <span style="font-size:0.85rem; font-weight:600; opacity:0.8;">Correct Answer:</span>
        <label style="display:flex; align-items:center; gap:6px; cursor:pointer; background:${isTrue ? '#e8f5e9' : '#fff'}; padding:6px 14px; border:1px solid ${isTrue ? 'var(--green)' : 'var(--line)'}; border-radius:6px;">
          <input type="radio" name="tf_key_${index}" class="q-tf-radio" data-index="${index}" value="True" ${isTrue ? 'checked' : ''}>
          <strong>True (Tama)</strong>
        </label>
        <label style="display:flex; align-items:center; gap:6px; cursor:pointer; background:${isFalse ? '#e8f5e9' : '#fff'}; padding:6px 14px; border:1px solid ${isFalse ? 'var(--green)' : 'var(--line)'}; border-radius:6px;">
          <input type="radio" name="tf_key_${index}" class="q-tf-radio" data-index="${index}" value="False" ${isFalse ? 'checked' : ''}>
          <strong>False (Mali)</strong>
        </label>
      </div>
    `;
  }

  function renderIdentAnswer(q, index) {
    return `
      <div style="display:flex; gap:10px; align-items:center; margin-top:6px;">
        <span style="font-size:0.85rem; font-weight:600; opacity:0.8; white-space:nowrap;">Accepted Answer:</span>
        <input type="text" class="q-ident-answer" data-index="${index}" value="${esc(q.answer || '')}" placeholder="Type correct answer..." style="flex:1; border-radius:6px; padding:6px 10px;">
      </div>
    `;
  }

  function bindReviewScreen(draft, onPublish, onCancel) {
    // Discard draft
    document.querySelector('#cancelExamReview')?.addEventListener('click', () => {
      if (confirm('Discard this exam draft?')) onCancel();
    });

    // Change title / class / due / etc.
    document.querySelector('#reviewExamTitle')?.addEventListener('input', e => { draft.title = e.target.value; });
    document.querySelector('#reviewExamClass')?.addEventListener('change', e => { draft.classId = e.target.value; });
    document.querySelector('#reviewExamDue')?.addEventListener('change', e => { draft.due = e.target.value; });
    document.querySelector('#reviewExamQuarter')?.addEventListener('change', e => { draft.quarter = e.target.value; });
    document.querySelector('#reviewExamSubject')?.addEventListener('change', e => { draft.subject = e.target.value; });
    document.querySelector('#reviewExamComponent')?.addEventListener('change', e => { draft.component = e.target.value; });
    document.querySelector('#reviewExamTimeLimit')?.addEventListener('input', e => { draft.timeLimit = Number(e.target.value || 0); });

    // Add question
    const addQuestionHandler = () => {
      draft.questions.push({
        id: crypto.randomUUID(),
        prompt: 'New Question',
        type: 'mcq',
        choices: ['Option A', 'Option B', 'Option C', 'Option D'],
        answer: 'Option A',
        points: 1
      });
      renderAndUpdate();
    };
    document.querySelector('#reviewAddQuestion')?.addEventListener('click', addQuestionHandler);
    document.querySelector('#reviewAddQuestionBottom')?.addEventListener('click', addQuestionHandler);

    // Delete question
    document.querySelectorAll('.q-delete-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const idx = Number(btn.dataset.index);
        draft.questions.splice(idx, 1);
        renderAndUpdate();
      });
    });

    // Prompt change
    document.querySelectorAll('.q-prompt-input').forEach(input => {
      input.addEventListener('input', () => {
        const idx = Number(input.dataset.index);
        draft.questions[idx].prompt = input.value;
      });
    });

    // Points change
    document.querySelectorAll('.q-points-input').forEach(input => {
      input.addEventListener('input', () => {
        const idx = Number(input.dataset.index);
        draft.questions[idx].points = Math.max(1, Number(input.value || 1));
      });
    });

    // Type change
    document.querySelectorAll('.q-type-select').forEach(select => {
      select.addEventListener('change', () => {
        const idx = Number(select.dataset.index);
        const newType = select.value;
        const q = draft.questions[idx];
        q.type = newType;
        if (newType === 'mcq' && (!q.choices || q.choices.length < 2)) {
          q.choices = ['Option A', 'Option B', 'Option C', 'Option D'];
          q.answer = q.choices[0];
        } else if (newType === 'truefalse') {
          q.choices = ['True', 'False'];
          q.answer = 'True';
        } else if (newType === 'identification') {
          q.choices = [];
          q.answer = '';
        }
        renderAndUpdate();
      });
    });

    // Radio button choice select (MCQ)
    document.querySelectorAll('.q-key-radio').forEach(radio => {
      radio.addEventListener('change', () => {
        const qIdx = Number(radio.dataset.index);
        const cIdx = Number(radio.dataset.choiceIdx);
        const q = draft.questions[qIdx];
        q.answer = q.choices[cIdx];
        renderAndUpdate();
      });
    });

    // Radio button TF
    document.querySelectorAll('.q-tf-radio').forEach(radio => {
      radio.addEventListener('change', () => {
        const qIdx = Number(radio.dataset.index);
        draft.questions[qIdx].answer = radio.value;
        renderAndUpdate();
      });
    });

    // Choice text change
    document.querySelectorAll('.q-choice-text').forEach(input => {
      input.addEventListener('input', () => {
        const qIdx = Number(input.dataset.index);
        const cIdx = Number(input.dataset.choiceIdx);
        const q = draft.questions[qIdx];
        const oldVal = q.choices[cIdx];
        q.choices[cIdx] = input.value;
        if (q.answer === oldVal) {
          q.answer = input.value;
        }
      });
    });

    // Add choice to MCQ
    document.querySelectorAll('.q-add-choice-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const qIdx = Number(btn.dataset.index);
        const q = draft.questions[qIdx];
        const nextLetter = String.fromCharCode(65 + q.choices.length);
        q.choices.push(`Option ${nextLetter}`);
        renderAndUpdate();
      });
    });

    // Delete choice from MCQ
    document.querySelectorAll('.q-del-choice-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const qIdx = Number(btn.dataset.index);
        const cIdx = Number(btn.dataset.choiceIdx);
        const q = draft.questions[qIdx];
        const removed = q.choices.splice(cIdx, 1)[0];
        if (q.answer === removed) {
          q.answer = q.choices[0] || '';
        }
        renderAndUpdate();
      });
    });

    // Identification answer input
    document.querySelectorAll('.q-ident-answer').forEach(input => {
      input.addEventListener('input', () => {
        const qIdx = Number(input.dataset.index);
        draft.questions[qIdx].answer = input.value.trim();
      });
    });

    // Publish action
    const publishHandler = () => {
      if (!draft.title || !draft.title.trim()) {
        return alert('Please enter an exam title.');
      }
      if (!draft.classId) {
        return alert('Please select a target class.');
      }
      if (!draft.questions || !draft.questions.length) {
        return alert('The exam must contain at least 1 question.');
      }

      // Check if any question has no answer key
      const missingKey = draft.questions.find(q => !q.answer || !q.answer.trim());
      if (missingKey) {
        const itemIdx = draft.questions.indexOf(missingKey) + 1;
        return alert(`Item ${itemIdx} is missing a correct answer key. Please select or type the correct answer before publishing.`);
      }

      onPublish(draft);
    };

    document.querySelector('#publishAutoExam')?.addEventListener('click', publishHandler);
    document.querySelector('#publishAutoExamBottom')?.addEventListener('click', publishHandler);

    function renderAndUpdate() {
      const container = document.querySelector('#app');
      if (container) {
        container.innerHTML = renderReviewScreen(draft);
        bindReviewScreen(draft, onPublish, onCancel);
      }
    }
  }

  window.KLASEPH_EXAM_IMPORTER = {
    extractDocx,
    parseExamText,
    renderReviewScreen,
    bindReviewScreen
  };
})();
