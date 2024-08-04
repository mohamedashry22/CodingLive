'use client';

import dynamic from 'next/dynamic';
import { useEffect, useRef, useState } from 'react';
import styles from './page.module.css';

const MonacoEditor = dynamic(() => import('react-monaco-editor'), { ssr: false });

export default function Home() {
  const [code, setCode] = useState('');
  const [output, setOutput] = useState('');
  const [problem, setProblem] = useState(
    'Implement a function that takes an array of numbers and returns the sum.\n\nfunction sumArray(arr) {\n  // Your code here\n}\n'
  );
  const socketRef = useRef(null);

  useEffect(() => {
    const socket = new WebSocket('ws://localhost:6065/ws/');

    socketRef.current = socket;

    socket.addEventListener('open', (event) => {
      console.log('WebSocket connection established');
    });

    socket.addEventListener('message', (event) => {
      try {
        const message = JSON.parse(event.data);
        if (message.code !== undefined) {
          setCode(message.code);
        }
      } catch (e) {
        // Handle non-JSON messages separately
        console.log('Received non-JSON message:', event.data);
      }
    });

    socket.addEventListener('error', (event) => {
      console.error('WebSocket error:', event);
    });

    socket.addEventListener('close', (event) => {
      console.log('WebSocket connection closed:', event);
    });

    return () => {
      socket.close();
    };
  }, []);

  const handleCodeChange = (newValue) => {
    setCode(newValue);
    if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
      socketRef.current.send(JSON.stringify({ code: newValue }));
    }
  };

  const runCode = async () => {
    try {
      const response = await fetch('http://localhost:6065/run', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ code, language: 'javascript' }),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const text = await response.text();
      try {
        const result = JSON.parse(text);
        setOutput(JSON.stringify(result, null, 2));
      } catch (e) {
        setOutput(text);
      }
    } catch (error) {
      console.error('Error:', error);
      setOutput(`Error: ${error.message}`);
    }
  };

  const runTests = async () => {
    const testCases = [
      { input: [1, 2, 3], expectedOutput: 6 },
      { input: [-1, -2, -3], expectedOutput: -6 },
      { input: [0, 0, 0], expectedOutput: 0 },
    ];
    try {
      const response = await fetch('http://localhost:6065/run', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ code, language: 'javascript' }),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const text = await response.text();
      try {
        const result = JSON.parse(text);
        const results = testCases.map(testCase => {
          const output = eval(result + `\nsumArray(${JSON.stringify(testCase.input)});`);
          return { ...testCase, output, passed: output === testCase.expectedOutput };
        });
        setOutput(JSON.stringify(results, null, 2));
      } catch (e) {
        setOutput(text);
      }
    } catch (error) {
      console.error('Error:', error);
      setOutput(`Error: ${error.message}`);
    }
  };

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <h1>Ashry</h1>
        <button onClick={runCode} className={styles.button}>
          Run Code
        </button>
        <button onClick={runTests} className={styles.button}>
          Run Tests
        </button>
      </header>
      <div className={styles.problemStatement}>
        <h2>Problem Statement</h2>
        <pre>{problem}</pre>
      </div>
      <main className={styles.main}>
        <div className={styles.editor}>
          <MonacoEditor width="100%" height="100%" language="javascript" theme="vs-dark" value={code} onChange={handleCodeChange} />
        </div>
        <div className={styles.output}>
          <pre>{output}</pre>
        </div>
      </main>
    </div>
  );
}