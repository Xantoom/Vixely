# truehd, patched to compile

truehd 0.7.2 by Rainbaby (https://github.com/truehdd/truehdd), Apache-2.0, vendored unchanged except for
`src/utils/bitstream_io.rs`, marked `// Vixely:`. bitstream-io's `define_huffman_tree!` generates the writing side too,
which this decoder never uses and whose code grows exponentially with the depth of the tree: compiling the three tables
took 15 GB of memory, enough to get a CI runner killed, and nearly three minutes. Only the reading side is generated here.

Updating: copy a newer release's `src`, `Cargo.toml`, `LICENSE` and `README.md` over this folder and reapply the marked block.
