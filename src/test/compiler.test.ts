import { describe, it, expect } from 'vitest';
import { parseCNL, compileToPython } from '../compiler';

describe('IntentEngine Compiler Core', () => {
  describe('Variables and Assignments', () => {
    it('compiles variable declaration with value', () => {
      const cnl = 'DECLARE count AS Int WITH VALUE 10';
      const result = compileToPython(cnl);
      expect(result.errors).toHaveLength(0);
      expect(result.code.trim()).toBe('count: int = 10');
    });

    it('compiles variable declaration without initial value', () => {
      const cnl = 'DECLARE username AS String';
      const result = compileToPython(cnl);
      expect(result.errors).toHaveLength(0);
      expect(result.code.trim()).toBe('username: str');
    });

    it('compiles assignment to variable', () => {
      const cnl = `
        DECLARE total AS Int WITH VALUE 0
        SET total TO total + 5
      `;
      const result = compileToPython(cnl);
      expect(result.errors).toHaveLength(0);
      expect(result.code).toContain('total: int = 0');
      expect(result.code).toContain('total = (total + 5)');
    });
  });

  describe('Functions', () => {
    it('compiles a function declaration with parameters and return value', () => {
      const cnl = `
        DEFINE FUNCTION add(a: Int, b: Int) -> Int:
          RETURN a + b
        END FUNCTION
      `;
      const result = compileToPython(cnl);
      expect(result.errors).toHaveLength(0);
      expect(result.code).toContain('def add(a: int, b: int) -> int:');
      expect(result.code).toContain('return (a + b)');
    });

    it('compiles a function without parameters returning void', () => {
      const cnl = `
        DEFINE FUNCTION logStatus() -> Void:
          PRINT "System operational"
        END FUNCTION
      `;
      const result = compileToPython(cnl);
      expect(result.errors).toHaveLength(0);
      expect(result.code).toContain('def logStatus() -> None:');
      expect(result.code).toContain('print("System operational")');
    });
  });

  describe('Control Flow', () => {
    it('compiles if / else if / else statements', () => {
      const cnl = `
        IF score >= 90:
          PRINT "Grade A"
        ELSE IF score >= 75:
          PRINT "Grade B"
        ELSE:
          PRINT "Grade C"
        END IF
      `;
      const result = compileToPython(cnl);
      expect(result.errors).toHaveLength(0);
      expect(result.code).toContain('if (score >= 90):');
      expect(result.code).toContain('elif (score >= 75):');
      expect(result.code).toContain('else:');
    });
  });

  describe('Loops', () => {
    it('compiles for counter loop with step', () => {
      const cnl = `
        FOR i FROM 0 TO 10 STEP 2:
          PRINT i
        END FOR
      `;
      const result = compileToPython(cnl);
      expect(result.errors).toHaveLength(0);
      expect(result.code).toContain('for i in range(0, 10, 2):');
      expect(result.code).toContain('print(i)');
    });

    it('compiles for each loop over collection', () => {
      const cnl = `
        FOR EACH item IN items:
          PRINT item
        END FOR
      `;
      const result = compileToPython(cnl);
      expect(result.errors).toHaveLength(0);
      expect(result.code).toContain('for item in items:');
      expect(result.code).toContain('print(item)');
    });

    it('compiles while loop', () => {
      const cnl = `
        WHILE count > 0:
          SET count TO count - 1
        END WHILE
      `;
      const result = compileToPython(cnl);
      expect(result.errors).toHaveLength(0);
      expect(result.code).toContain('while (count > 0):');
      expect(result.code).toContain('count = (count - 1)');
    });
  });

  describe('Data Structure Operations', () => {
    it('compiles append operation', () => {
      const cnl = 'APPEND "apple" TO fruits';
      const result = compileToPython(cnl);
      expect(result.errors).toHaveLength(0);
      expect(result.code.trim()).toBe('fruits.append("apple")');
    });

    it('compiles filter operation to list comprehension', () => {
      const cnl = 'FILTER users WHERE age >= 18';
      const result = compileToPython(cnl);
      expect(result.errors).toHaveLength(0);
      expect(result.code).toContain('[x for x in users if (age >= 18)]');
    });

    it('compiles sort operation', () => {
      const cnl = 'SORT users BY age DESC';
      const result = compileToPython(cnl);
      expect(result.errors).toHaveLength(0);
      expect(result.code).toContain('reverse=True');
    });
  });

  describe('Classes & Data Types', () => {
    it('compiles class with fields to python dataclass', () => {
      const cnl = `
        DEFINE CLASS User:
          FIELD name AS String
          FIELD age AS Int
        END CLASS
      `;
      const result = compileToPython(cnl);
      expect(result.errors).toHaveLength(0);
      expect(result.code).toContain('@dataclass');
      expect(result.code).toContain('class User:');
      expect(result.code).toContain('name: str');
      expect(result.code).toContain('age: int');
    });
  });

  describe('Error Handling', () => {
    it('compiles try / catch / finally', () => {
      const cnl = `
        TRY:
          PRINT "Attempting operation"
        CATCH err AS String:
          PRINT "Error occurred"
        FINALLY:
          PRINT "Cleanup complete"
        END TRY
      `;
      const result = compileToPython(cnl);
      expect(result.errors).toHaveLength(0);
      expect(result.code).toContain('try:');
      expect(result.code).toContain('except str as err:');
      expect(result.code).toContain('finally:');
    });
  });

  describe('Escape Hatch (Raw Code Blocks)', () => {
    it('inlines raw python code verbatim', () => {
      const cnl = 'RAW PYTHON { import numpy as np }';
      const result = compileToPython(cnl);
      expect(result.errors).toHaveLength(0);
      expect(result.code).toContain('import numpy as np');
    });
  });
});
