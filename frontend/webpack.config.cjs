const path = require('path');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const ForkTsCheckerWebpackPlugin = require('fork-ts-checker-webpack-plugin');
const webpack = require('webpack');

const apiBaseUrl = process.env.API_BASE_URL || '/api';

module.exports = {
  entry: path.resolve(__dirname, 'src/main.tsx'),
  output: {
    path: path.resolve(__dirname, 'dist'),
    filename: 'assets/[name].[contenthash:8].js',
    publicPath: '/',
    clean: true
  },
  resolve: {
    extensions: ['.ts', '.tsx', '.js', '.jsx'],
    alias: {
      '@': path.resolve(__dirname, 'src')
    }
  },
  module: {
    rules: [
      {
        test: /\.tsx?$/,
        use: {
          loader: 'ts-loader',
          options: {
            transpileOnly: true
          }
        },
        exclude: /node_modules/
      },
      {
        test: /\.css$/,
        use: ['style-loader', 'css-loader']
      },
      {
        test: /\.(png|jpg|jpeg|webp|svg)$/i,
        type: 'asset/resource',
        generator: {
          filename: 'assets/images/[name].[contenthash:8][ext]'
        }
      }
    ]
  },
  plugins: [
    new HtmlWebpackPlugin({
      template: path.resolve(__dirname, 'index.html'),
      favicon: path.resolve(__dirname, 'src/assets/lightbi-favicon.png')
    }),
    new ForkTsCheckerWebpackPlugin(),
    new webpack.DefinePlugin({
      'process.env.API_BASE_URL': JSON.stringify(apiBaseUrl)
    })
  ],
  optimization: {
    runtimeChunk: 'single',
    splitChunks: {
      chunks: 'async',
      minSize: 20000,
      maxAsyncSize: 240000,
      cacheGroups: {
        react: {
          test: /[\\/]node_modules[\\/](react|react-dom|react-router-dom|scheduler)[\\/]/,
          name: 'vendor-react',
          chunks: 'initial',
          priority: 30,
          enforce: true
        },
        antd: {
          test: /[\\/]node_modules[\\/](@ant-design|antd|rc-.*)[\\/]/,
          name: 'vendor-antd',
          chunks: 'initial',
          maxInitialSize: 240000,
          priority: 20,
          reuseExistingChunk: true
        },
        antvG2: {
          test: /[\\/]node_modules[\\/]@antv[\\/]g2[\\/]/,
          name: 'vendor-antv-g2',
          chunks: 'async',
          priority: 40,
          enforce: true
        },
        antvS2: {
          test: /[\\/]node_modules[\\/]@antv[\\/]s2[\\/]/,
          name: 'vendor-antv-s2',
          chunks: 'async',
          priority: 40,
          enforce: true
        },
        antvX6: {
          test: /[\\/]node_modules[\\/]@antv[\\/]x6[\\/]/,
          name: 'vendor-antv-x6',
          chunks: 'async',
          priority: 40,
          enforce: true
        },
        antvShared: {
          test: /[\\/]node_modules[\\/]@antv[\\/]/,
          name: 'vendor-antv-shared',
          chunks: 'async',
          priority: 15,
          reuseExistingChunk: true
        },
        vendors: {
          test: /[\\/]node_modules[\\/]/,
          name: 'vendor',
          chunks: 'async',
          maxAsyncSize: 240000,
          priority: 10,
          reuseExistingChunk: true
        }
      }
    }
  },
  devServer: {
    port: 3000,
    historyApiFallback: true,
    hot: true,
    open: false,
    proxy: [
      {
        context: ['/api'],
        target: 'http://localhost:8080',
        changeOrigin: true
      }
    ]
  }
};
