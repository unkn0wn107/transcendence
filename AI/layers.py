import numpy as np

np.random.seed()

X = [[1, 2, 3, 2.5],
     [2.0, 5.0, -1.0, 2.0],
     [-1.5, 2.7, 3.3, -0.8]]

class Layer_Dense:
    def __init__(self, n_inputs, n_neurons):
        self.weights = np.random.randn(n_inputs, n_neurons)             # Weights are set with random numbers
        self.biases = np.zeros((1, n_neurons))                          # Biases are set to 0
    def forward(self, inputs):
        self.output = np.dot(inputs, self.weights) + self.biases        # Output are calculate by multiplying each input with theirs weight and then adding the biaises

# EXAMPLE:
# layer1 = Layer_Dense(4, 5)
# layer2 = Layer_Dense(5, 2)

# layer1.forward(X)
# layer2.forward(layer1.output)
# print(layer2.output)

class Activation_ReLU:
    def forward(self, inputs):
        self.output = np.maximum(0, inputs)

# EXAMPLE:
# layer1 = Layer_Dense(4, 5)
# activation1 = Activation_ReLU()

# layer1.forward(X)

# print("layer1.output:\n", layer1.output)
# activation1.forward(layer1.output)
# print("\nactivation1.output:\n", activation1.output)

