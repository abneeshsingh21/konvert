import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { compileAll, compileToPython, compileToJava, compileToCpp } from '../compiler/index.js';
import { ProjectCompiler } from '../compiler/projectCompiler.js';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

describe('Konvert Production Grammar 2.0 & Cross-Language Interop Suite', () => {

  describe('1. ENUM Declarations', () => {
    const cnl = `
      DEFINE ENUM OrderStatus:
        PENDING,
        SHIPPED,
        DELIVERED,
        CANCELLED
      END ENUM
    `;

    it('compiles ENUM to Python Enum class', () => {
      const res = compileToPython(cnl);
      expect(res.errors).toHaveLength(0);
      expect(res.code).toContain('from enum import Enum');
      expect(res.code).toContain('class OrderStatus(Enum):');
      expect(res.code).toContain('PENDING = "PENDING"');
      expect(res.code).toContain('DELIVERED = "DELIVERED"');
    });

    it('compiles ENUM to modern Java enum', () => {
      const res = compileToJava(cnl);
      expect(res.errors).toHaveLength(0);
      expect(res.code).toContain('public enum OrderStatus { PENDING, SHIPPED, DELIVERED, CANCELLED }');
    });

    it('compiles ENUM to scoped C++20 enum class', () => {
      const res = compileToCpp(cnl);
      expect(res.errors).toHaveLength(0);
      expect(res.code).toContain('enum class OrderStatus { PENDING, SHIPPED, DELIVERED, CANCELLED };');
    });
  });

  describe('2. INTERFACE Declarations', () => {
    const cnl = `
      DEFINE INTERFACE PaymentProcessor:
        FUNCTION charge(amount: Float, currency: String) -> Bool
        FUNCTION refund(transactionId: String) -> Bool
      END INTERFACE
    `;

    it('compiles INTERFACE to Python ABC abstract class', () => {
      const res = compileToPython(cnl);
      expect(res.errors).toHaveLength(0);
      expect(res.code).toContain('from abc import ABC, abstractmethod');
      expect(res.code).toContain('class PaymentProcessor(ABC):');
      expect(res.code).toContain('@abstractmethod');
      expect(res.code).toContain('def charge(self, amount: float, currency: str) -> bool:');
      expect(res.code).toContain('def refund(self, transactionId: str) -> bool:');
    });

    it('compiles INTERFACE to Java public interface', () => {
      const res = compileToJava(cnl);
      expect(res.errors).toHaveLength(0);
      expect(res.code).toContain('public interface PaymentProcessor {');
      expect(res.code).toContain('boolean charge(double amount, String currency);');
      expect(res.code).toContain('boolean refund(String transactionId);');
    });

    it('compiles INTERFACE to C++ pure virtual struct', () => {
      const res = compileToCpp(cnl);
      expect(res.errors).toHaveLength(0);
      expect(res.code).toContain('struct PaymentProcessor {');
      expect(res.code).toContain('virtual ~PaymentProcessor() = default;');
      expect(res.code).toContain('virtual bool charge(double amount, std::string currency) = 0;');
      expect(res.code).toContain('virtual bool refund(std::string transactionId) = 0;');
    });
  });

  describe('3. ASYNC Functions & AWAIT Expressions', () => {
    const cnl = `
      DEFINE ASYNC FUNCTION fetchScore(userId: String) -> Int:
        RETURN 95
      END FUNCTION

      DEFINE FUNCTION main() -> Void:
        DECLARE score AS Int WITH VALUE AWAIT fetchScore("usr_42")
        PRINT score
      END FUNCTION
    `;

    it('compiles ASYNC and AWAIT to Python 3.12 async/await', () => {
      const res = compileToPython(cnl);
      expect(res.errors).toHaveLength(0);
      expect(res.code).toContain('async def fetchScore(userId: str) -> int:');
      expect(res.code).toContain('score: int = await fetchScore("usr_42")');
    });

    it('compiles ASYNC to Java CompletableFuture and AWAIT to .join()', () => {
      const res = compileToJava(cnl);
      expect(res.errors).toHaveLength(0);
      expect(res.code).toContain('public static CompletableFuture<Integer> fetchScore(String userId) {');
      expect(res.code).toContain('int score = fetchScore("usr_42").join();');
    });

    it('compiles ASYNC to C++ std::future and AWAIT to .get()', () => {
      const res = compileToCpp(cnl);
      expect(res.errors).toHaveLength(0);
      expect(res.code).toContain('std::future<int> fetchScore(std::string userId) {');
      expect(res.code).toContain('int score = fetchScore("usr_42").get();');
    });
  });

  describe('4. Inter-Module Dependency Resolution in Multi-File Projects', () => {
    let tempDir: string;

    beforeEach(() => {
      tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'konvert-interop-'));
      ProjectCompiler.initProject(tempDir, 'interop-app');
    });

    afterEach(() => {
      try {
        fs.rmSync(tempDir, { recursive: true, force: true });
      } catch {
        // ignore
      }
    });

    it('automatically injects cross-module imports in Python, Java, and C++', () => {
      const result = ProjectCompiler.compileProject(tempDir, 'all');
      expect(result.success).toBe(true);

      // 1. Python imports check
      const pyUserSvc = fs.readFileSync(path.join(tempDir, 'dist', 'python', 'services', 'userService.py'), 'utf-8');
      expect(pyUserSvc).toContain('from ..models.user import User');

      const pyMain = fs.readFileSync(path.join(tempDir, 'dist', 'python', 'main.py'), 'utf-8');
      expect(pyMain).toContain('from models.user import User');
      expect(pyMain).toContain('from services.userService import UserService');

      // 2. Java imports check
      const javaUserSvc = fs.readFileSync(path.join(tempDir, 'dist', 'java', 'src', 'main', 'java', 'services', 'userService.java'), 'utf-8');
      expect(javaUserSvc).toContain('package services;');
      expect(javaUserSvc).toContain('import models.User;');

      const javaMain = fs.readFileSync(path.join(tempDir, 'dist', 'java', 'src', 'main', 'java', 'main.java'), 'utf-8');
      expect(javaMain).toContain('import models.User;');
      expect(javaMain).toContain('import services.UserService;');

      // 3. C++ includes check
      const cppUserSvc = fs.readFileSync(path.join(tempDir, 'dist', 'cpp', 'src', 'services', 'userService.cpp'), 'utf-8');
      expect(cppUserSvc).toContain('#include "models/user.hpp"');

      const cppMain = fs.readFileSync(path.join(tempDir, 'dist', 'cpp', 'src', 'main.cpp'), 'utf-8');
      expect(cppMain).toContain('#include "models/user.hpp"');
      expect(cppMain).toContain('#include "services/userService.hpp"');
    });
  });
});
