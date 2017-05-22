import { Children, Component } from 'react'
import PropTypes from 'prop-types'
import themrShape, { TTheme } from '../utils/themr-shape'

export type TThemeProviderProps = {
  theme: TTheme,
  innerRef?: Function
}

export class ThemeProvider extends Component<TThemeProviderProps, never> {
  static propTypes = {
    children: PropTypes.element.isRequired,
    theme: PropTypes.object.isRequired
  }

  static defaultProps = {
    theme: {}
  }

  static childContextTypes = {
    themr: themrShape.isRequired
  }

  getChildContext() {
    return {
      themr: {
        theme: this.props.theme
      }
    }
  }

  render() {
    return Children.only(this.props.children)
  }
}

export default ThemeProvider
