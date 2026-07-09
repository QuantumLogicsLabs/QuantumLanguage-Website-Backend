const QUANTUM_SYSTEM_INSTRUCTION = `
You are the official Quantum Language Assistant, a premium AI helper designed to explain, write, and debug code in the Quantum programming language.

Quantum is a dynamically typed, multi-paradigm scripting language that compiles .sa source files to bytecode and runs them on a custom register-stack VM. It was written in C++17 from scratch.

Core Features of Quantum:
1. Multi-Syntax Support:
   - Python-style, JavaScript-style, and C/C++-style syntax are all valid and can be mixed in the same file.
   - Variable styles: 'name = "Alice"' (bare), 'let x = 42' (quantum), 'const MAX = 100' (const), and 'int count = 0' (decorative C++ style type hint).
   - Control flow: picking 'if x > 0:' (Python-style), 'if x > 0 { ... }' (brace-style), or 'if(x > 0) { ... }' (C++ style).
2. Five Function Styles:
   - Quantum style: fn add(a, b) { return a + b }
   - Python style: def greet(name): return "Hi, " + name
   - JS style: function mul(a, b) { return a * b }
   - Arrow style: double = (x) => x * 2
   - Anonymous style: square = fn(n) { return n * n }
3. Object-Oriented Programming:
   - Uses 'class Name', 'fn init(...)', 'self' instead of 'this', and supports inheritance using 'extends'.
   - Example:
     class Animal {
         fn init(name) { self.name = name }
         fn speak() { return self.name + " makes a sound" }
     }
     class Dog extends Animal {
         fn speak() { return self.name + " barks" }
     }
4. Pointers (Real pointers in a scripting language!):
   - Address-of: '&x'
   - Dereference + assign: '*ptr = 99'
   - Object arrow operator: 'pp = &p; print(pp->x)'
5. Collections:
   - Arrays with slicing: 'arr = [1, 2, 3, 4, 5]; print(arr[1:3]);' (slices are inclusive-exclusive like Python) or 'arr[::-1]' to reverse.
   - List comprehensions: 'squares = [x * x for x in range(1, 6)]'
   - Dictionaries: 'person = { "name": "Saad", "age": 18 }'
6. Exception Handling:
   - Uses 'try/catch' blocks: 'try { if x == 0 { throw "err" } } catch(e) { print(e) }'
7. Standard Library (200+ native functions):
   - Core: len(), type(), range(), print(), input(), assert(), list(), enumerate(), zip(), map(), filter(), sorted()
   - Math: abs, sqrt, floor, ceil, round, pow, log, sin, cos, tan, PI, E, INF, is_prime, gcd, lcm
   - Crypto & Security: sha256(), md5(), aes128_ecb_encrypt(), rot13(), xor_bytes(), base64_encode(), hmac_sha256(), secure_random_hex(), entropy()
   - File I/O: read_file(), write_file()
   - String Methods: .upper(), .lower(), .split(), .replace(), .contains(), .startswith(), .endswith(), .index_of(), .slice()

When answering:
- Keep your answers highly developer-oriented, precise, and concise.
- Format all code snippets in markdown code blocks. Since Quantum combines JS, Python, and C++, you can use 'javascript', 'python', or 'cpp' tags for beautiful syntax highlighting in code blocks.
- If writing code, ensure it adheres to valid Quantum syntax (as shown above).
- Be extremely friendly and helpful, matching the cybersecurity/hacker futuristic vibe of the website.
`;

const LOCAL_FALLBACK_RESPONSES = {
    purpose: `### Purpose of Quantum Language
Quantum is a **dynamically typed, multi-paradigm scripting language** that compiles \`.sa\` source files to bytecode and runs them on a custom register-stack VM.

It was designed to give developers the ultimate syntactical freedom by supporting **Python-style, JavaScript-style, and C/C++-style syntax all in the same file**. It also includes built-in security and cryptography functions (e.g. \`sha256\`, \`aes128_ecb_encrypt\`) making it a cybersecurity-ready tool.
\n\n*Running in local fallback mode. Define \`GEMINI_API_KEY\` in your backend \`.env\` file to activate full AI assistance.*`,

    pointers: `### Pointers in Quantum
Quantum supports **real pointers** directly inside a scripting language! You can use them for reference passing and in-place mutations.

\`\`\`python
# Pointer creation and dereferencing
let x = 42
let ptr = &x        # Address-of
*ptr = 99           # Dereference + assignment
print(x)            # Output: 99

# Object pointer with arrow operator
class Point { fn init(x, y) { self.x = x; self.y = y } }
let p = Point(3, 4)
let pp = &p
print(pp->x)        # Output: 3
\`\`\`
\n*Running in local fallback mode. Define \`GEMINI_API_KEY\` in your backend \`.env\` file to activate full AI assistance.*`,

    syntax: `### Multi-Syntax in Quantum
Quantum allows you to write code in the syntax style you prefer. You can mix and match styles in a single file!

**Variables:**
\`\`\`python
name = "Alice"           # bare assignment (Python style)
let x = 42               # Quantum style
const MAX = 100          # JavaScript constant
int count = 0            # C++ style type hint (decorative)
\`\`\`

**Control Flow:**
\`\`\`python
# Python style
if x > 0:
    print("positive")

# JavaScript/C++ style
if (x > 0) {
    print("positive");
}
\`\`\`
\n*Running in local fallback mode. Define \`GEMINI_API_KEY\` in your backend \`.env\` file to activate full AI assistance.*`,

    functions: `### Five Styles of Functions in Quantum
Quantum supports five distinct ways to define functions:

\`\`\`python
# 1. Quantum style
fn add(a, b) { return a + b }

# 2. Python style
def greet(name): 
    return "Hi, " + name

# 3. JavaScript style
function mul(a, b) { 
    return a * b 
}

# 4. Arrow syntax
double = (x) => x * 2

# 5. Anonymous functions
square = fn(n) { return n * n }
\`\`\`
\n*Running in local fallback mode. Define \`GEMINI_API_KEY\` in your backend \`.env\` file to activate full AI assistance.*`,

    oop: `### Object-Oriented Programming in Quantum
Classes in Quantum support constructors (\`init\`), member variable reference via \`self\`, and single inheritance using the \`extends\` keyword.

\`\`\`javascript
class Animal {
    fn init(name, sound) {
        self.name = name
        self.sound = sound
    }
    fn speak() {
        return self.name + " says " + self.sound
    }
}

class Dog extends Animal {
    fn fetch(item) {
        return self.name + " fetches the " + item
    }
}

let dog = Dog("Rex", "Woof")
print(dog.speak())   # Rex says Woof
print(dog.fetch("ball")) # Rex fetches the ball
\`\`\`
\n*Running in local fallback mode. Define \`GEMINI_API_KEY\` in your backend \`.env\` file to activate full AI assistance.*`,

    install: `### Prerequisites & Build Guide
Quantum primarily targets **Windows** systems.

**Prerequisites:**
- C++17 compatible compiler (MSVC 2019+, GCC 9+, Clang 10+)
- CMake 3.16+

**Building from source:**
\`\`\`bash
# Full clean build
build.bat

# Incremental build (faster)
build-fast.bat
\`\`\`

**Running scripts:**
\`\`\`bash
qrun hello.sa     # Interpret directly (no executable file created)
quantum hello.sa  # Compile to standalone hello.exe and run
\`\`\`
\n*Running in local fallback mode. Define \`GEMINI_API_KEY\` in your backend \`.env\` file to activate full AI assistance.*`,

    crypto: `### Security & Cryptography Native Functions
Quantum ships with standard, native functions optimized for secure coding and pen-testing utilities.

\`\`\`python
# Hashing
print(sha256("quantum"))
print(md5("quantum"))

# Encryption
let ciphertext = aes128_ecb_encrypt("plaintext_key123", "secret_data")

# Encoding
print(base64_encode("hello world"))

# Helpers
let entropy_score = entropy("averylongcomplexstringhere123!")
let hex_string = secure_random_hex(16)
\`\`\`
\n*Running in local fallback mode. Define \`GEMINI_API_KEY\` in your backend \`.env\` file to activate full AI assistance.*`,

    collections: `### Arrays, Comprehensions & Dictionaries
Quantum has rich built-in support for collections:

\`\`\`python
# Slicing (inclusive:exclusive)
arr = [1, 2, 3, 4, 5]
print(arr[1:3])   # [2, 3]
print(arr[::-1])  # Reversed: [5, 4, 3, 2, 1]

# Comprehensions
squares = [x * x for x in range(1, 6)]
evens = [x for x in range(10) if x % 2 == 0]

# Dictionaries
person = {
    "name": "Saad",
    "age": 18
}
print(person["name"])
\`\`\`
\n*Running in local fallback mode. Define \`GEMINI_API_KEY\` in your backend \`.env\` file to activate full AI assistance.*`,

    help: `### Welcome to Quantum AI Assistant!
I'm here to help you learn and build applications using the **Quantum Language**.

Here are some topics you can ask me about:
* **Syntax styles**: How we combine Python, JS, and C++.
* **Pointers**: How address-of (\`&\`) and dereferencing (\`*\`) work.
* **OOP**: Defining classes, methods, and using \`extends\`.
* **Standard Library**: Native crypto, math, socket, and file functions.
* **Installation**: How to compile the VM on Windows.

*Type a message or select one of the quick prompts to get started!*
\n\n*Running in local fallback mode. Define \`GEMINI_API_KEY\` in your backend \`.env\` file to activate full AI assistance.*`
};

async function handleChatRequest(req, res) {
    const { messages } = req.body || {};

    if (!Array.isArray(messages) || messages.length === 0) {
        return res.status(400).json({ success: false, error: 'Messages array is required.' });
    }

    const lastUserMessage = [...messages].reverse().find(m => m.role === 'user');
    const userText = lastUserMessage ? lastUserMessage.content : '';

    const apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey) {
        // Fallback local mode
        const text = userText.toLowerCase();
        let reply = LOCAL_FALLBACK_RESPONSES.help;
        let matched = false;

        if (text.includes('purpose') || text.includes('why') || text.includes('concept') || text.includes('goal') || text.includes('idea') || text.includes('what is')) {
            reply = LOCAL_FALLBACK_RESPONSES.purpose;
            matched = true;
        }
        if (!matched && (text.includes('pointer') || text.includes('address') || text.includes('deref') || text.includes('&') || text.includes('->'))) {
            reply = LOCAL_FALLBACK_RESPONSES.pointers;
            matched = true;
        }
        if (!matched && (text.includes('syntax') || text.includes('style') || text.includes('look') || text.includes('write'))) {
            reply = LOCAL_FALLBACK_RESPONSES.syntax;
            matched = true;
        }
        if (!matched && (text.includes('function') || text.includes('method') || text.includes('define') || text.includes('def '))) {
            reply = LOCAL_FALLBACK_RESPONSES.functions;
            matched = true;
        }
        if (!matched && (text.includes('class') || text.includes('oop') || text.includes('inherit') || text.includes('extends') || text.includes('object'))) {
            reply = LOCAL_FALLBACK_RESPONSES.oop;
            matched = true;
        }
        if (!matched && (text.includes('install') || text.includes('setup') || text.includes('build') || text.includes('prerequisite') || text.includes('run'))) {
            reply = LOCAL_FALLBACK_RESPONSES.install;
            matched = true;
        }
        if (!matched && (text.includes('crypto') || text.includes('security') || text.includes('sha256') || text.includes('md5') || text.includes('encrypt'))) {
            reply = LOCAL_FALLBACK_RESPONSES.crypto;
            matched = true;
        }
        if (!matched && (text.includes('list') || text.includes('array') || text.includes('comprehension') || text.includes('dictionary') || text.includes('collection'))) {
            reply = LOCAL_FALLBACK_RESPONSES.collections;
            matched = true;
        }

        return res.json({
            success: true,
            message: reply,
            isFallback: true
        });
    }

    try {
        // Map messages to Gemini API content format
        const geminiContents = messages.map(msg => {
            const role = msg.role === 'assistant' ? 'model' : 'user';
            return {
                role,
                parts: [{ text: msg.content }]
            };
        });

        const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;
        const response = await fetch(geminiUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                contents: geminiContents,
                systemInstruction: {
                    parts: [{ text: QUANTUM_SYSTEM_INSTRUCTION }]
                }
            })
        });

        if (!response.ok) {
            const errData = await response.json().catch(() => ({}));
            console.error('Gemini API error status:', response.status, errData);
            throw new Error(errData.error?.message || `HTTP error ${response.status}`);
        }

        const data = await response.json();
        const replyText = data.candidates?.[0]?.content?.parts?.[0]?.text || "I'm sorry, I couldn't generate a response.";

        return res.json({
            success: true,
            message: replyText,
            isFallback: false
        });

    } catch (err) {
        console.error('Error generating response via Gemini:', err);
        return res.status(500).json({
            success: false,
            error: 'Failed to generate AI response. Details: ' + err.message
        });
    }
}

module.exports = {
    handleChatRequest
};
