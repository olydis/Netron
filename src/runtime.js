/*jshint esversion: 6 */

function assert(assertion, message) {
    if (!assertion) {
        debugger;
        throw new Error(message || "Assertion failed.");
    }
}

function shape(tensor) {
    const result = [];
    while (Array.isArray(tensor)) {
        result.push(tensor.length);
        tensor = tensor[0];
    }
    return result;
}

function createTensor(shape, internalOffset) {
    internalOffset = internalOffset || 0;
    if (internalOffset < shape.length) {
        const size = shape[internalOffset];
        const result = new Array(size);
        internalOffset++;
        for (let i = 0; i < size; ++i) {
            result[i] = createTensor(shape, internalOffset);
        }
        return result;
    }
    return 0;
}

function transpose(tensor) {
    const s = shape(tensor);
    const result = createTensor([s[1], s[0]]);
    for (let j = 0; j < s[1]; ++j) {
        for (let i = 0; i < s[0]; ++i) {
            result[j][i] = tensor[i][j];
        }
    }
    return result;
}

function elemwise(f, tensor) {
    return Array.isArray(tensor) ? tensor.map(x => elemwise(f, x)) : f(tensor);
}

function forwardOperator(operator, attributes, inputs) {
    switch (operator) {
        case "Gemm":
            {
                const alpha = +attributes['alpha'] || 0;
                const beta = +attributes['beta'] || 0;
                const broadcast = (+attributes['broadcast'] || 0) != 0; // TODO
                const transA = (+attributes['transA'] || 0) != 0;
                const transB = (+attributes['transB'] || 0) != 0;
                let A = inputs['A'];
                let B = inputs['B'];
                let C = inputs['C'];
                while (shape(C).length < 2) C = [C];
                if (transA) A = transpose(A);
                if (transB) B = transpose(B);
                const As = shape(A);
                const Bs = shape(B);
                const Cs = shape(C);
                assert(As[1] == Bs[0]);
                assert(Cs[0] == As[0] || broadcast);
                assert(Cs[1] == Bs[1]);
                const m = As[0];
                const k = As[1];
                const n = Bs[1];
                const Y = createTensor([m, n]);
                for (let i = 0; i < m; ++i) {
                    for (let j = 0; j < n; ++j) {
                        let val = C[i % Cs[0]][j];
                        for (let h = 0; h < k; ++h) {
                            val += A[i][h] * B[h][j];
                        }
                        Y[i][j] = val;
                    }
                }
                return { Y };
            }
            break;
        case "Elu": 
            {
                const alpha = 'alpha' in attributes ? (+attributes['alpha'] || 0) : 1;
                const X = inputs['X'];
                const Y = elemwise(x => x < 0 ? alpha * Math.expm1(x) : x, X);
                return { Y };
            }
            break;
        default:
            console.log(operator, JSON.stringify(attributes), Object.keys(inputs));
            console.log(operator + " not implemented");
            debugger;
            break;
    }
    return {};
}

function forward(graph, inputBatch) {
    // batchify
    if (!Array.isArray(inputBatch)) inputBatch = [inputBatch];

    const dependencies = {};
    for (const node of graph.nodes) {
        for (const output of node.outputs) {
            for (const outputConnection of output.connections) {
                const outputConnectionId = outputConnection.id;
                const dependencyNode = dependencies[outputConnectionId] = dependencies[outputConnectionId] || { node: node, inputs: {} };
                for (const input of node.inputs) {
                    for (const inputConnection of input.connections) {
                        const inputConnectionId = inputConnection.id;
                        dependencyNode.inputs[inputConnectionId] = true;
                    }
                }
            }
        }
    }
    const topoSort = [];
    const dfs = (id) => {
        if (id in dependencies) {
            const dependsOn = dependencies[id];
            delete dependencies[id];
            for (const depId in dependsOn.inputs) {
                dfs(depId);
            }
            topoSort.push(dependsOn.node);
        }
    };
    for (const id in dependencies) {
        dfs(id);
    }

    const data = {};
    const resultBatch = [];
    for (const inputs of inputBatch) {
        Object.assign(data, inputs);
        for (const node of topoSort) {
            // fetch inputs
            const opInput = {};
            for (const input of node.inputs) {
                for (const inputConnection of input.connections) {
                    const inputConnectionId = inputConnection.id;
                    // already set?
                    if (inputConnectionId in data) {
                        continue;
                    }
                    // initializer?
                    const init = graph.getInitializer(inputConnectionId);
                    if (init) {
                        data[inputConnectionId] = init.value_PARSED = init.value_PARSED || JSON.parse(init.value);
                        continue;
                    }
                    // fail
                    throw new Error(`Could not find source of input '${inputConnectionId}'.`);
                }
                opInput[input.name] = data[input.connections[0].id];
            }
            // fetch attributes
            const attributes = {};
            for (const attrib of node.attributes) {
                attributes[attrib.name] = attrib.value;
            }
            // execute
            const opOutput = forwardOperator(node.operator, attributes, opInput);
            // write outputs
            for (const output of node.outputs) {
                for (const outputConnection of output.connections) {
                    const outputConnectionId = outputConnection.id;
                    data[outputConnectionId] = opOutput[output.name];
                }
            }
        }
    
        const result = {};
        for (const output of graph.outputs) {
            result[output.id] = data[output.id];
        }
        resultBatch.push(result);
    }
    return resultBatch;
}